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

  let inserted = 0;
  const errors: string[] = [];

  for (const c of rows) {
    if (!c.name?.trim()) continue;

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
      name: c.name.trim(),
      company: c.company,
      role: c.role,
      scope: "personal", // sensible default for iPhone Contacts; user can flip per-row later
      tags: [],
      phones: c.phones,
      emails: c.emails,
      addresses: c.addresses,
      socials: c.socials,
      important_dates,
      relationships: [],
      notes: c.notes,
      avatar_url: null,
      organization_id,
      // Mirror legacy single-value columns for backwards compat with
      // voice-extraction queries.
      phone: c.phones[0]?.value ?? null,
      email: c.emails[0]?.value ?? null,
      birthday: c.birthday,
    });

    if (error) {
      errors.push(`${c.name}: ${error.message}`);
      continue;
    }
    inserted += 1;
  }

  revalidatePath("/people");
  return NextResponse.json({
    inserted,
    errors,
  });
}
