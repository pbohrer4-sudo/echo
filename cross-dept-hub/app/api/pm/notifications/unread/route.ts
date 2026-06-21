import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET /api/pm/notifications/unread?since=<iso>
// Returns the caller's recent unread notifications. Used by the foreground
// browser-notification poller. RLS restricts rows to the caller.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const since = new URL(request.url).searchParams.get("since");
  let query = supabase
    .from("pm_notifications")
    .select("id, title, body, link, created_at")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (since) query = query.gt("created_at", since);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notifications: data ?? [] });
}
