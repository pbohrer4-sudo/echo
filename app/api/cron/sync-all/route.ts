import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCalendarSync } from "@/lib/calendar-sync";
import { runGmailSync } from "@/lib/email-sync";
import type { ServiceConnection } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes — long enough for a few users

// Cron-target endpoint. Loops through every connected real-OAuth
// connection in the system and runs the appropriate sync.
//
// Auth: requires header `Authorization: Bearer ${CRON_SECRET}` OR the
// Vercel-cron-specific `x-vercel-cron: 1` signal (Vercel sets this
// when invoking scheduled jobs in its own platform).
//
// Wire it up by adding to vercel.json:
//   {
//     "crons": [
//       { "path": "/api/cron/sync-all", "schedule": "0 * * * *" }
//     ]
//   }
// and setting CRON_SECRET in env. The hourly schedule is a sensible
// default — bumps to every 15 min if you want fresher data.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runAll();
}

// POST mirror so manual invocation from cron-job.org or curl works
// without forcing a GET.
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runAll();
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Refuse to run a cron endpoint without auth configured —
    // otherwise anyone with the URL can drain Google API quota.
    return false;
  }
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

interface PerUserResult {
  user_id: string;
  provider: string;
  ok: boolean;
  pulled?: number;
  ingested?: number;
  interactions_created?: number;
  error?: string;
}

async function runAll(): Promise<NextResponse> {
  const admin = createAdminClient();
  const started = Date.now();

  // Pull every connected calendar + gmail row. We skip stub tokens
  // — those crash inside getGoogleAccess and just add noise.
  const { data: conns, error } = await admin
    .from("service_connections")
    .select("*")
    .in("provider", ["google_calendar", "gmail"])
    .eq("status", "connected")
    .is("deleted_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: PerUserResult[] = [];
  for (const conn of (conns ?? []) as ServiceConnection[]) {
    if (conn.access_token?.startsWith("stub_")) continue;
    const scope = { supabase: admin, userId: conn.user_id };
    try {
      if (conn.provider === "google_calendar") {
        const r = await runCalendarSync(scope, conn);
        results.push({
          user_id: conn.user_id,
          provider: conn.provider,
          ok: r.ok,
          pulled: r.pulled,
          ingested: r.ingested,
          interactions_created: r.interactions_created,
          error: r.error,
        });
      } else if (conn.provider === "gmail") {
        const r = await runGmailSync(scope, conn);
        results.push({
          user_id: conn.user_id,
          provider: conn.provider,
          ok: r.ok,
          pulled: r.pulled,
          ingested: r.ingested,
          interactions_created: r.interactions_created,
          error: r.error,
        });
      }
    } catch (err) {
      results.push({
        user_id: conn.user_id,
        provider: conn.provider,
        ok: false,
        error: err instanceof Error ? err.message : "sync threw",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - started,
    processed: results.length,
    results,
  });
}
