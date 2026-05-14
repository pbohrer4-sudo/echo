import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseVcards, type VCardContact } from "@/lib/vcard";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 20 * 1024 * 1024;

// Smart-Match: für jede vCard-Person sammeln wir alle Signale (Name,
// normalisierte Phones, lower-cased Emails) und prüfen gegen die
// bestehenden Personen. Wenn EIN Signal trifft, schlagen wir „mergen
// mit X" vor; bei mehreren Signal-Treffern wird der Match höher
// gewichtet. Default-Aktion in der UI orientiert sich an confidence.

interface MatchInfo {
  person_id: string;
  person_name: string;
  confidence: "high" | "medium" | "low";
  reasons: string[]; // z. B. ["name", "phone"], ["email"]
}

interface PreviewRow extends VCardContact {
  key: string;
  match: MatchInfo | null;
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Datei zu groß (max. 20 MB)" },
      { status: 400 },
    );
  }

  const text = await file.text();
  const parsed = parseVcards(text);

  const [peopleRes, contactsRes] = await Promise.all([
    supabase
      .from("people")
      .select("id, name, phones, emails")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .eq("is_self", false),
    supabase
      .from("person_contacts")
      .select("person_id, channel, value")
      .eq("user_id", user.id)
      .in("channel", ["phone", "whatsapp", "email"]),
  ]);

  if (peopleRes.error) {
    return NextResponse.json({ error: peopleRes.error.message }, { status: 500 });
  }

  interface PersonRow {
    id: string;
    name: string;
  }
  const people: PersonRow[] = (peopleRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
  }));

  const byName = new Map<string, string>();
  for (const p of people) byName.set(p.name.trim().toLowerCase(), p.id);

  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();

  // V3 person_contacts
  for (const c of (contactsRes.data ?? []) as {
    person_id: string;
    channel: string;
    value: string;
  }[]) {
    if (c.channel === "email") {
      byEmail.set(c.value.trim().toLowerCase(), c.person_id);
    } else {
      const digits = normalizePhone(c.value);
      if (digits.length >= 7) byPhone.set(digits, c.person_id);
    }
  }

  // Legacy JSONB phones/emails (transition-period)
  for (const row of peopleRes.data ?? []) {
    const phones = (row.phones ?? []) as { value?: string }[];
    for (const ph of phones) {
      const digits = normalizePhone(ph?.value ?? "");
      if (digits.length >= 7 && !byPhone.has(digits)) {
        byPhone.set(digits, row.id as string);
      }
    }
    const emails = (row.emails ?? []) as { value?: string }[];
    for (const em of emails) {
      const lower = em?.value?.trim().toLowerCase();
      if (lower && !byEmail.has(lower)) {
        byEmail.set(lower, row.id as string);
      }
    }
  }

  const nameOfId = new Map<string, string>(
    people.map((p) => [p.id, p.name]),
  );

  function bestMatch(c: VCardContact): MatchInfo | null {
    const hits = new Map<string, Set<string>>();
    function record(personId: string, reason: string) {
      if (!hits.has(personId)) hits.set(personId, new Set());
      hits.get(personId)!.add(reason);
    }

    const nameHit = byName.get(c.name.trim().toLowerCase());
    if (nameHit) record(nameHit, "name");

    for (const ph of c.phones) {
      const digits = normalizePhone(ph.value);
      if (digits.length < 7) continue;
      const hit = byPhone.get(digits);
      if (hit) record(hit, "phone");
    }
    for (const em of c.emails) {
      const lower = em.value.trim().toLowerCase();
      if (!lower) continue;
      const hit = byEmail.get(lower);
      if (hit) record(hit, "email");
    }

    if (hits.size === 0) return null;

    let bestId: string | null = null;
    let bestReasons: Set<string> = new Set();
    for (const [pid, reasons] of hits) {
      if (
        reasons.size > bestReasons.size ||
        (reasons.size === bestReasons.size &&
          reasons.has("phone") &&
          !bestReasons.has("phone"))
      ) {
        bestId = pid;
        bestReasons = reasons;
      }
    }
    if (!bestId) return null;

    const reasons = Array.from(bestReasons);
    const hasName = reasons.includes("name");
    const hasPhone = reasons.includes("phone");
    const hasEmail = reasons.includes("email");
    let confidence: "high" | "medium" | "low" = "low";
    if (
      (hasPhone && hasEmail) ||
      (hasPhone && hasName) ||
      (hasEmail && hasName)
    ) {
      confidence = "high";
    } else if (hasPhone || hasName || hasEmail) {
      confidence = "medium";
    }

    return {
      person_id: bestId,
      person_name: nameOfId.get(bestId) ?? "Unbekannt",
      confidence,
      reasons,
    };
  }

  const rows: PreviewRow[] = parsed.map((c, i) => ({
    ...c,
    key: `vcf-${i}`,
    match: bestMatch(c),
  }));

  return NextResponse.json({
    rows,
    summary: {
      parsed: rows.length,
      matches: rows.filter((r) => r.match !== null).length,
      high_confidence: rows.filter((r) => r.match?.confidence === "high").length,
      file_name: file.name,
      file_size: file.size,
    },
  });
}
