import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveOrCreateOrganization } from "@/lib/organizations";
import type { VCardContact } from "@/lib/vcard";

export const runtime = "nodejs";
export const maxDuration = 60;

interface CommitRequest {
  rows: VCardContact[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CommitRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "no rows" }, { status: 400 });
  }

  // Server-side dedup: load all existing non-self people for the user
  // and skip any incoming row whose name (case-insensitive) already
  // exists. The preview endpoint flags duplicates client-side, but the
  // user could submit them anyway — this is the canonical guard.
  const { data: existingPeople } = await supabase
    .from("people")
    .select("name")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .eq("is_self", false);
  const existingNames = new Set(
    (existingPeople ?? []).map((p) =>
      String(p.name ?? "").trim().toLowerCase(),
    ),
  );

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const c of rows) {
    const name = c.name?.trim();
    if (!name) continue;
    if (existingNames.has(name.toLowerCase())) {
      skipped += 1;
      continue;
    }

    const organization_id = await resolveOrCreateOrganization(
      c.company,
      user.id,
    );

    // Build the important_dates array from BDAY only — anniversaries
    // get added later in the form. Birthday opted in to remind by
    // default since that's the typical iPhone Contacts intent.
    const important_dates = c.birthday
      ? [{ label: "Geburtstag", date: c.birthday, remind: true }]
      : [];

    const { error } = await supabase.from("people").insert({
      user_id: user.id,
      name,
      company: c.company,
      role: c.role,
      phones: c.phones,
      emails: c.emails,
      addresses: c.addresses,
      socials: c.socials,
      important_dates,
      relationships: [],
      notes: c.notes,
      organization_id,
      // Briefing v3: iPhone-Contacts werden als persönlich klassifiziert.
      purpose: "personal" as const,
    });

    if (error) {
      errors.push(`${name}: ${error.message}`);
      continue;
    }
    existingNames.add(name.toLowerCase());
    inserted += 1;
  }

  revalidatePath("/people");

  // Surface partial-success via a 207-style payload but keep 200 so
  // the client can read the body — only fail loudly when nothing was
  // inserted at all.
  const status = inserted === 0 && errors.length > 0 ? 500 : 200;
  return NextResponse.json({ inserted, skipped, errors }, { status });
}
