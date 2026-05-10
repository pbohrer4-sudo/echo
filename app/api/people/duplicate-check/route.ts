import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/user-context";

export const runtime = "nodejs";

// Quick "is this person already in the CRM?" probe used by the new-
// person form. Looks up exact / substring name matches and email
// matches; phone match is a digit-normalised compare.
//
// Stays cheap on purpose — runs on every keystroke (debounced
// client-side). RLS handles user-scoping.
export async function GET(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ matches: [] });
  }

  const url = new URL(request.url);
  const name = (url.searchParams.get("name") ?? "").trim();
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const phone = (url.searchParams.get("phone") ?? "").replace(/\D/g, "");

  // Need at least one signal to look up.
  if (name.length < 2 && email.length < 4 && phone.length < 5) {
    return NextResponse.json({ matches: [] });
  }

  const supabase = await createClient();
  const matches = new Map<
    string,
    { id: string; name: string; company: string | null; role: string | null; reason: string }
  >();

  // Name: substring match (case-insensitive). pg_trgm GIN index makes
  // this fast even at scale.
  if (name.length >= 2) {
    const { data } = await supabase
      .from("people")
      .select("id, name, company, role")
      .ilike("name", `%${name}%`)
      .is("deleted_at", null)
      .eq("is_self", false)
      .limit(5);
    for (const row of data ?? []) {
      matches.set(row.id, {
        id: row.id,
        name: row.name,
        company: row.company,
        role: row.role,
        reason: "Ähnlicher Name",
      });
    }
  }

  // Email match — exact, both legacy column and JSONB array.
  if (email.length >= 4 && email.includes("@")) {
    const { data: legacy } = await supabase
      .from("people")
      .select("id, name, company, role")
      .ilike("email", email)
      .is("deleted_at", null)
      .limit(3);
    for (const row of legacy ?? []) {
      matches.set(row.id, {
        id: row.id,
        name: row.name,
        company: row.company,
        role: row.role,
        reason: "Gleiche Email",
      });
    }
    // JSONB scan
    const { data: byEmails } = await supabase
      .from("people")
      .select("id, name, company, role, emails")
      .not("emails", "is", null)
      .is("deleted_at", null);
    for (const row of byEmails ?? []) {
      const arr = (row.emails as Array<{ value?: string }> | null) ?? [];
      if (arr.some((e) => e.value?.toLowerCase() === email)) {
        matches.set(row.id, {
          id: row.id,
          name: row.name,
          company: row.company,
          role: row.role,
          reason: "Gleiche Email",
        });
      }
    }
  }

  // Phone: digit-normalised compare across legacy + JSONB.
  if (phone.length >= 5) {
    const { data: rows } = await supabase
      .from("people")
      .select("id, name, company, role, phones, phone")
      .is("deleted_at", null);
    for (const row of rows ?? []) {
      const legacyDigits = (row.phone ?? "").replace(/\D/g, "");
      if (legacyDigits && legacyDigits === phone) {
        matches.set(row.id, {
          id: row.id,
          name: row.name,
          company: row.company,
          role: row.role,
          reason: "Gleiche Telefonnummer",
        });
        continue;
      }
      const arr = (row.phones as Array<{ value?: string }> | null) ?? [];
      if (arr.some((p) => (p.value ?? "").replace(/\D/g, "") === phone)) {
        matches.set(row.id, {
          id: row.id,
          name: row.name,
          company: row.company,
          role: row.role,
          reason: "Gleiche Telefonnummer",
        });
      }
    }
  }

  return NextResponse.json({ matches: Array.from(matches.values()).slice(0, 5) });
}
