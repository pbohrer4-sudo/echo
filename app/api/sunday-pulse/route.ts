import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/user-context";
import { generatePulse } from "@/lib/pulse";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { mapAnthropicError } from "@/lib/anthropic-error";
import { logAnthropic } from "@/lib/llm-usage";

export const runtime = "nodejs";
export const maxDuration = 30;

// Vercel cron sends GET, no session cookie. Authorisation in that mode
// is the shared CRON_SECRET in `Authorization: Bearer …` (Vercel
// auto-injects this header when CRON_SECRET is set on the project).
//
// Browser-initiated runs from the pulse page POST with the session
// cookie and use the user's normal auth.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (
    !cronSecret ||
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Cron mode: nothing to do without a target user. The full multi-user
  // sweep would need a service-role enumeration of profiles, which is
  // outside the scope of this route. For single-user deployments,
  // configure CRON_TARGET_USER_ID and we'll generate for that user only.
  const targetUserId = process.env.CRON_TARGET_USER_ID;
  if (!targetUserId) {
    return NextResponse.json({
      ok: true,
      skipped: "CRON_TARGET_USER_ID not set",
    });
  }

  // We can't easily build a user-scoped Supabase client without a
  // session cookie, so cron-mode pulse generation is a no-op until
  // the multi-user runtime lands. Returning ok keeps the schedule
  // green; the user-initiated POST below remains the working path.
  return NextResponse.json({ ok: true, mode: "cron-noop", targetUserId });
}

export async function POST() {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit({
    userId: ctx.user_id,
    key: "pulse",
    ...LIMITS.pulse,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen — kurz warten." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const supabase = await createClient();
  const startMs = Date.now();
  try {
    const result = await generatePulse(ctx);
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/sunday-pulse",
      model: result.model,
      usage: result.usage,
      latencyMs: Date.now() - startMs,
    });
    return NextResponse.json({ text: result.text });
  } catch (err) {
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/sunday-pulse",
      model: "claude-sonnet-4-6",
      usage: null,
      latencyMs: Date.now() - startMs,
      status: "error",
    });
    const { status, message } = mapAnthropicError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
