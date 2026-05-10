import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/user-context";
import {
  getGoogleAccess,
  matchPersonByEmail,
  type SupabaseScope,
} from "@/lib/google";
import { getConnectionByProvider } from "@/lib/connections";
import type { ServiceConnection } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Gmail sync via Users.messages.list + Users.messages.get. Same
// session/cron dual-entry-point pattern as calendar-sync. Body
// fetching is opt-in per message; we always pull snippet (cheap).

const MAX_MESSAGES = 30;

interface GmailListReply {
  messages?: Array<{ id: string; threadId: string }>;
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

export interface EmailSyncResult {
  ok: boolean;
  pulled: number;
  ingested: number;
  matched_to_people: number;
  interactions_created: number;
  error?: string;
}

// Session-context entry point used by /api/email/sync.
export async function syncGmail(): Promise<EmailSyncResult> {
  const ctx = await getUserContext();
  if (!ctx) return zero({ ok: false, error: "unauthorized" });

  const conn = await getConnectionByProvider("gmail");
  if (!conn || conn.status !== "connected") {
    return zero({ ok: false, error: "not connected" });
  }

  const supabase = await createClient();
  return runGmailSync({ supabase, userId: ctx.user_id }, conn);
}

// Explicit-context entry point used by cron.
export async function runGmailSync(
  scope: SupabaseScope,
  conn: ServiceConnection,
): Promise<EmailSyncResult> {
  let auth;
  try {
    auth = await getGoogleAccess(conn, scope);
  } catch (err) {
    return zero({
      ok: false,
      error: err instanceof Error ? err.message : "auth failed",
    });
  }

  const myEmail = (conn.account_label ?? "").toLowerCase();

  const listUrl = new URL(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages",
  );
  listUrl.searchParams.set("maxResults", String(MAX_MESSAGES));
  listUrl.searchParams.set("q", "-category:promotions -category:social");

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    cache: "no-store",
  });
  if (!listRes.ok) {
    const text = await listRes.text().catch(() => "");
    return zero({
      ok: false,
      error: `Gmail list ${listRes.status}: ${text.slice(0, 200)}`,
    });
  }
  const list = (await listRes.json()) as GmailListReply;
  const ids = (list.messages ?? []).map((m) => m.id);

  const supabase: SupabaseClient = scope.supabase;
  let ingested = 0;
  let matched = 0;
  let interactions = 0;

  for (const id of ids) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
      {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
        cache: "no-store",
      },
    );
    if (!msgRes.ok) continue;
    const msg = (await msgRes.json()) as GmailMessage;

    const headers = new Map<string, string>();
    for (const h of msg.payload?.headers ?? []) {
      headers.set(h.name.toLowerCase(), h.value);
    }
    const from = parseEmail(headers.get("from"));
    const toList = parseEmailList(headers.get("to"));
    const ccList = parseEmailList(headers.get("cc"));
    const subject = headers.get("subject") ?? null;
    const messageAt = msg.internalDate
      ? new Date(parseInt(msg.internalDate, 10)).toISOString()
      : new Date().toISOString();

    const direction: "in" | "out" =
      from.email && from.email.toLowerCase() === myEmail ? "out" : "in";

    const otherEmails =
      direction === "in"
        ? [from.email].filter((e): e is string => !!e)
        : toList.map((t) => t.email).filter((e): e is string => !!e);

    const matches = await Promise.all(
      otherEmails.map((e) => matchPersonByEmail(e, scope)),
    );
    const matchedIds = Array.from(
      new Set(matches.filter((m): m is string => !!m)),
    );
    if (matchedIds.length > 0) matched += matchedIds.length;

    const { data: upserted, error: upsertErr } = await supabase
      .from("external_messages")
      .upsert(
        {
          user_id: scope.userId,
          provider: "gmail",
          external_id: msg.id,
          thread_id: msg.threadId ?? null,
          direction,
          from_email: from.email ?? null,
          from_name: from.name ?? null,
          to_emails: toList.map((t) => t.email).filter(Boolean) as string[],
          cc_emails: ccList.map((c) => c.email).filter(Boolean) as string[],
          subject,
          snippet: msg.snippet ?? null,
          message_at: messageAt,
          labels: msg.labelIds ?? [],
          raw: msg as unknown as Record<string, unknown>,
          matched_person_ids: matchedIds,
        },
        { onConflict: "user_id,provider,external_id" },
      )
      .select("id, interaction_id")
      .maybeSingle();
    if (upsertErr) {
      console.error("[email-sync] upsert failed", upsertErr.message);
      continue;
    }
    ingested += 1;

    if (upserted && !upserted.interaction_id && matchedIds.length > 0) {
      for (const personId of matchedIds) {
        const summary =
          [subject, msg.snippet?.slice(0, 100)]
            .filter(Boolean)
            .join(" — ") || "Email";
        const { data: ins } = await supabase
          .from("interactions")
          .insert({
            user_id: scope.userId,
            person_id: personId,
            type: "email",
            source: "calendar",
            occurred_at: messageAt,
            summary,
          })
          .select("id")
          .maybeSingle();
        if (ins?.id) {
          interactions += 1;
          await supabase
            .from("external_messages")
            .update({ interaction_id: ins.id })
            .eq("id", upserted.id);
        }
      }
    }
  }

  await supabase
    .from("service_connections")
    .update({
      last_used_at: new Date().toISOString(),
      config: {
        ...(conn.config as Record<string, unknown>),
        last_sync_at: new Date().toISOString(),
        last_sync_pulled: ids.length,
        last_sync_ingested: ingested,
      },
    })
    .eq("id", conn.id);

  return {
    ok: true,
    pulled: ids.length,
    ingested,
    matched_to_people: matched,
    interactions_created: interactions,
  };
}

function parseEmail(raw: string | undefined): {
  name: string | null;
  email: string | null;
} {
  if (!raw) return { name: null, email: null };
  const m = raw.match(/^\s*(?:"?([^"<]+?)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/);
  if (!m) return { name: null, email: raw.trim() };
  return { name: m[1]?.trim() || null, email: m[2].trim() };
}

function parseEmailList(raw: string | undefined): Array<{
  name: string | null;
  email: string | null;
}> {
  if (!raw) return [];
  return raw.split(/,(?=(?:[^"]|"[^"]*")*$)/).map((part) => parseEmail(part));
}

function zero(extra: Partial<EmailSyncResult>): EmailSyncResult {
  return {
    ok: false,
    pulled: 0,
    ingested: 0,
    matched_to_people: 0,
    interactions_created: 0,
    ...extra,
  };
}
