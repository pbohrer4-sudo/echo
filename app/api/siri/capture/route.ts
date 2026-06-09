import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerFromRequest, resolveUserIdFromToken } from "@/lib/api-token";
import { getUserContextById } from "@/lib/user-context";
import { runExtraction } from "@/lib/extract-run";
import { CommitError, commitToolCalls } from "@/lib/extract-commit";
import { mapAnthropicError } from "@/lib/anthropic-error";
import type { ToolCall } from "@/lib/tools";

export const runtime = "nodejs";

// Siri / Apple Shortcuts voice capture.
//
// Auth: a personal API token in `Authorization: Bearer echo_…` (see
// lib/api-token.ts + migration 0046). No Supabase session cookie is
// involved — we resolve the token to a user_id and run everything under
// the service-role client, scoped explicitly to that user.
//
// Two-phase by design, to honour the "never auto-apply AI output" rule
// (CLAUDE.md → AI Integration Rules #1) while staying hands-free:
//
//   Phase 1 (preview):  POST { transcript }
//       → extracts, returns a spoken read-back + the tool calls. Writes
//         NOTHING. Siri speaks the summary and asks "Speichern?".
//
//   Phase 2 (commit):   POST { transcript, confirm: true, toolCalls }
//       → persists the tool calls the Shortcut echoes back from phase 1.
//
// The Shortcut holds the phase-1 `toolCalls` in a variable and sends them
// back verbatim on confirmation.

interface CaptureRequest {
  transcript?: string;
  confirm?: boolean;
  toolCalls?: ToolCall[];
}

// Lightweight per-user rate limit via the atomic increment RPC, run on the
// admin client (the cookie-based lib/rate-limit.ts has no session here).
async function tokenRateLimit(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<boolean> {
  const windowSec = 60;
  const limit = 30;
  const windowStart = new Date(
    Math.floor(Date.now() / (windowSec * 1000)) * windowSec * 1000,
  ).toISOString();
  const { data, error } = await admin.rpc("rate_limit_increment", {
    p_user_id: userId,
    p_key: "siri_capture",
    p_window_start: windowStart,
  });
  // Fail open: a rate-limiter outage shouldn't block legitimate capture.
  if (error || typeof data !== "number") return true;
  return data <= limit;
}

function summarize(commits: {
  people: number;
  interactions: number;
  notes: number;
  reminders: number;
  todos: number;
}): string {
  const parts: string[] = [];
  if (commits.people) parts.push(`${commits.people} Kontakt(e)`);
  if (commits.interactions) parts.push(`${commits.interactions} Interaktion(en)`);
  if (commits.notes) parts.push(`${commits.notes} Notiz(en)`);
  if (commits.reminders) parts.push(`${commits.reminders} Erinnerung(en)`);
  if (commits.todos) parts.push(`${commits.todos} Aufgabe(n)`);
  if (parts.length === 0) return "Nichts zu speichern.";
  return `Gespeichert: ${parts.join(", ")}.`;
}

export async function POST(request: Request) {
  const token = bearerFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const resolved = await resolveUserIdFromToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = resolved.user_id;

  const admin = createAdminClient();
  const withinLimit = await tokenRateLimit(admin, userId);
  if (!withinLimit) {
    return NextResponse.json(
      { error: "Zu viele Anfragen — kurz warten.", spoken: "Zu viele Anfragen, bitte kurz warten." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: CaptureRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // ── Phase 2: commit confirmed tool calls ───────────────────────────────
  if (body.confirm === true) {
    const toolCalls = Array.isArray(body.toolCalls) ? body.toolCalls : [];
    if (toolCalls.length === 0) {
      return NextResponse.json(
        { error: "no toolCalls to commit", spoken: "Nichts zu speichern." },
        { status: 400 },
      );
    }
    try {
      const { commits, created_person_ids } = await commitToolCalls({
        supabase: admin,
        userId,
        toolCalls,
      });
      revalidatePath("/people");
      revalidatePath("/inbox");
      return NextResponse.json({
        phase: "committed",
        ok: true,
        spoken: summarize(commits),
        commits,
        created_person_ids,
      });
    } catch (err) {
      if (err instanceof CommitError) {
        return NextResponse.json(
          {
            error: err.message,
            commits: err.commits,
            spoken: "Beim Speichern ist etwas schiefgelaufen.",
          },
          { status: 500 },
        );
      }
      const message = err instanceof Error ? err.message : "commit failed";
      return NextResponse.json(
        { error: message, spoken: "Beim Speichern ist etwas schiefgelaufen." },
        { status: 500 },
      );
    }
  }

  // ── Phase 1: preview (extract only, no writes) ─────────────────────────
  const transcript = body.transcript?.trim();
  if (!transcript) {
    return NextResponse.json(
      { error: "transcript required", spoken: "Ich habe nichts verstanden." },
      { status: 400 },
    );
  }

  const ctx = await getUserContextById(userId);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { text, toolCalls } = await runExtraction({
      supabase: admin,
      userId,
      displayName: ctx.display_name,
      claudeKey: ctx.claude_key,
      transcript,
      endpoint: "/api/siri/capture",
      serviceRole: true,
    });

    // Tool calls that actually write something (query_people is read-only).
    const writeCalls = toolCalls.filter((c) => c.name !== "query_people");
    const spoken =
      writeCalls.length > 0
        ? `${text || "Verstanden."} Soll ich das speichern?`
        : text || "Verstanden.";

    return NextResponse.json({
      phase: "preview",
      spoken,
      has_writes: writeCalls.length > 0,
      toolCalls: writeCalls,
      text,
    });
  } catch (err) {
    const { message } = mapAnthropicError(err);
    return NextResponse.json(
      { error: message, spoken: "Entschuldigung, das hat nicht geklappt." },
      { status: 500 },
    );
  }
}
