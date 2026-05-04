import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface FinalizeBody {
  summary: string;
  duration_sec: number;
  counts: {
    people: number;
    interactions: number;
    notes: number;
    reminders: number;
    todos: number;
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: FinalizeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const today = new Date();
  const dateOnly = today.toISOString().slice(0, 10);

  const { error } = await supabase.from("debriefs").insert({
    user_id: user.id,
    date: dateOnly,
    summary: body.summary?.slice(0, 4000) ?? null,
    interaction_ids: [],
    action_ids: [],
    duration_sec: Math.max(0, Math.floor(body.duration_sec)),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/debrief/history");
  return NextResponse.json({ ok: true });
}
