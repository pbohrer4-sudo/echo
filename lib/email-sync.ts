import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/user-context";
import { getGoogleAccess, matchPersonByEmail } from "@/lib/google";
import { getConnectionByProvider } from "@/lib/connections";

// Gmail sync via Users.messages.list + Users.messages.get. We pull
// the most recent N messages, ingest minimal metadata + snippet, and
// create an interaction row for each message that matches a known
// person via sender or recipient.
//
// Body fetching is opt-in per message. Snippet (first ~120 chars) is
// always cheap. We DON'T pull body by default to keep tokens / quota
// low; the user can drill into Gmail directly via the deeplink.

const MAX_MESSAGES = 30;

interface GmailListReply {
  messages?: Array<{ id: string; threadId: string }>;
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string; // ms epoch as string
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

export async function syncGmail(): Promise<EmailSyncResult> {
  const ctx = await getUserContext();
  if (!ctx) return zero({ ok: false, error: "unauthorized" });

  const conn = await getConnectionByProvider("gmail");
  if (!conn || conn.status !== "connected") {
    return zero({ ok: false, error: "not connected" });
  }

  let auth;
  try {
    auth = await getGoogleAccess(conn);
  } catch (err) {
    return zero({
      ok: false,
      error: err instanceof Error ? err.message : "auth failed",
    });
  }

  const myEmail = (conn.account_label ?? ctx.email ?? "").toLowerCase();

  const listUrl = new URL(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages",
  );
  listUrl.searchParams.set("maxResults", String(MAX_MESSAGES));
  // Skip promo/social labels — Patrick wants real correspondence.
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

  const supabase = await createClient();
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

    // Match the OTHER party — for incoming, the sender; for outgoing,
    // each recipient. This is what makes the message show up on the
    // right person's timeline.
    const otherEmails =
      direction === "in"
        ? [from.email].filter((e): e is string => !!e)
        : toList.map((t) => t.email).filter((e): e is string => !!e);

    const matches = await Promise.all(otherEmails.map((e) => matchPersonByEmail(e)));
    const matchedIds = Array.from(new Set(matches.filter((m): m is string => !!m)));
    if (matchedIds.length > 0) matched += matchedIds.length;

    const { data: upserted, error: upsertErr } = await supabase
      .from("external_messages")
      .upsert(
        {
          user_id: ctx.user_id,
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
            user_id: ctx.user_id,
            person_id: personId,
            type: "email",
            source: "calendar", // schema only allows debrief|manual|calendar — group sync sources under calendar for now
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

// Parse "Name <email@host>" header into structured form. Tolerant of
// the many ways email clients format these.
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
  // Naive split — handles most real-world headers; commas inside
  // quoted display names get handled by parseEmail's regex.
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
