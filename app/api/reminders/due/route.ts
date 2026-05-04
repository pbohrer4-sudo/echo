import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Returns pending reminders whose remind_at falls in the window
//   [now - lookback, now + window]
// Lookback is to catch reminders the client missed (slept tab, etc.).
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const windowSec = clampInt(url.searchParams.get("window"), 60, 1, 3600);
  const lookbackSec = clampInt(url.searchParams.get("lookback"), 600, 0, 86400);

  const now = Date.now();
  const from = new Date(now - lookbackSec * 1000).toISOString();
  const to = new Date(now + windowSec * 1000).toISOString();

  const { data, error } = await supabase
    .from("reminders")
    .select("id, person_id, text, remind_at, type, recurrence")
    .eq("status", "pending")
    .gte("remind_at", from)
    .lte("remind_at", to)
    .order("remind_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reminders: data ?? [] });
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
