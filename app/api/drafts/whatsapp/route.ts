import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateDraft, type DraftUseCase } from "@/lib/drafts";
import type { Person } from "@/lib/types";

export const runtime = "nodejs";

const VALID_USE_CASES: DraftUseCase[] = [
  "reengage",
  "business",
  "birthday",
  "intro_thanks",
  "follow_up",
  "lebenszeichen",
];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { person_id?: string; use_case?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (
    !body.person_id ||
    !body.use_case ||
    !VALID_USE_CASES.includes(body.use_case as DraftUseCase)
  ) {
    return NextResponse.json(
      { error: "person_id und gültiger use_case erforderlich" },
      { status: 400 },
    );
  }

  const { data: person, error: pErr } = await supabase
    .from("people")
    .select("*")
    .eq("id", body.person_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  if (!person) {
    return NextResponse.json({ error: "Person nicht gefunden" }, { status: 404 });
  }

  const draft = await generateDraft(
    person as Person,
    body.use_case as DraftUseCase,
  );
  if (!draft) {
    return NextResponse.json(
      { error: "Draft-Generierung fehlgeschlagen — API-Key prüfen" },
      { status: 500 },
    );
  }

  return NextResponse.json(draft);
}
