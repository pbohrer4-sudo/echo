import { createClient } from "@/lib/supabase/server";

// Per-user token-bucket rate limiter backed by Supabase. We keep the
// state in a tiny `rate_limits` table (one row per user × bucket key)
// rather than wiring up Vercel KV / Upstash, since this stays
// single-user-per-deployment for now and the call rate is low.
//
// `limit` requests per `windowSec` seconds. Returns { ok, retryAfter }.
// When ok=false the caller should respond with 429 and the
// Retry-After header set to retryAfter.

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number;
}

export async function rateLimit(opts: {
  userId: string;
  key: string;
  limit: number;
  windowSec: number;
}): Promise<RateLimitResult> {
  const { userId, key, limit, windowSec } = opts;
  const supabase = await createClient();
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSec * 1000)) * windowSec * 1000;
  const windowStartIso = new Date(windowStart).toISOString();

  // Upsert the bucket row, increment count atomically via a Postgres
  // function. If the function isn't installed, fall back to a
  // read-then-write that's racy but acceptable for a single-user app.
  const { data, error } = await supabase.rpc("rate_limit_increment", {
    p_user_id: userId,
    p_key: key,
    p_window_start: windowStartIso,
  });

  if (!error && typeof data === "number") {
    if (data > limit) {
      const retryAfter = Math.ceil(
        (windowStart + windowSec * 1000 - now) / 1000,
      );
      return { ok: false, retryAfter: Math.max(1, retryAfter) };
    }
    return { ok: true, retryAfter: 0 };
  }

  // Fallback path — not concurrency-safe but doesn't fail the request.
  const { data: existing } = await supabase
    .from("rate_limits")
    .select("count")
    .eq("user_id", userId)
    .eq("key", key)
    .eq("window_start", windowStartIso)
    .maybeSingle();

  const nextCount = ((existing?.count as number | undefined) ?? 0) + 1;
  await supabase.from("rate_limits").upsert(
    {
      user_id: userId,
      key,
      window_start: windowStartIso,
      count: nextCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,key,window_start" },
  );

  if (nextCount > limit) {
    const retryAfter = Math.ceil(
      (windowStart + windowSec * 1000 - now) / 1000,
    );
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }
  return { ok: true, retryAfter: 0 };
}

// Conventional limits. AI calls cost real money, so they get tight
// per-minute caps; the cheap routes get looser ones.
export const LIMITS = {
  ai_extract: { limit: 30, windowSec: 60 },
  ai_synthesize: { limit: 30, windowSec: 60 },
  ai_scan_card: { limit: 10, windowSec: 60 },
  ai_enrich: { limit: 20, windowSec: 60 },
  ai_workflow_gen: { limit: 10, windowSec: 60 },
  ai_chat: { limit: 30, windowSec: 60 },
  address_search: { limit: 60, windowSec: 60 },
  recap: { limit: 10, windowSec: 60 },
  pulse: { limit: 10, windowSec: 60 },
} as const;
