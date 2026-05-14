import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/user-context";
import { generateRecap } from "@/lib/recap";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { mapAnthropicError } from "@/lib/anthropic-error";
import { logAnthropic } from "@/lib/llm-usage";

export const runtime = "nodejs";
export const maxDuration = 30;

interface RecapBody {
  period: "month" | "year";
  // 1-12 for month, 4-digit year
  year?: number;
  month?: number;
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit({
    userId: ctx.user_id,
    key: "recap",
    ...LIMITS.recap,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen — kurz warten." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: RecapBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Use UTC throughout — the deployed Vercel runtime is UTC; using
  // local-time constructors would shift month boundaries by an hour
  // (or more around DST flips) for users in DE.
  const now = new Date();
  let from: Date;
  let to: Date;
  let periodLabel: string;

  if (body.period === "year") {
    const year = body.year ?? now.getUTCFullYear();
    from = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    periodLabel = `Jahr ${year}`;
  } else {
    const year = body.year ?? now.getUTCFullYear();
    const month = body.month ?? now.getUTCMonth() + 1;
    from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    to = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    periodLabel = from.toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  const supabase = await createClient();
  const startMs = Date.now();
  try {
    const result = await generateRecap({ ctx, from, to, periodLabel });
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/recap",
      model: result.model,
      usage: result.usage,
      latencyMs: Date.now() - startMs,
    });
    return NextResponse.json({ text: result.text, stats: result.stats });
  } catch (err) {
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/recap",
      model: "claude-sonnet-4-6",
      usage: null,
      latencyMs: Date.now() - startMs,
      status: "error",
    });
    const { status, message } = mapAnthropicError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
