// Signale = Tags im 'reminders'-Cluster (V3-Sprache).
//
// Briefing-Idee: Wiederkehrende Anker pro Person, z. B.
// „geburtstag-26-march", „q3-follow-up", „kind-2025-geboren".
// Sie leben als reguläre Tags im 'reminders'-Cluster, sind aber
// emotional/funktional eine eigene Kategorie.
//
// Diese Lib aggregiert alle Signale über alle Personen für die
// /heute-Sektion und exponiert eine Funktion zum Anlegen eines
// echten Reminders aus einem Signal heraus.

import { createClient } from "@/lib/supabase/server";

export interface SignalHit {
  tag_id: string;
  tag_name: string;
  person_id: string;
  person_name: string;
  note: string | null;       // person-spezifische Tag-Note (0028)
  // Versuch, ein Datum aus dem Tag-Namen abzuleiten ("geburtstag-
  // 26-march", "26-03", "follow-up-2025-05" → next occurrence).
  parsed_date: string | null; // YYYY-MM-DD oder null
  // Existiert schon ein aktiver Reminder dessen Text das Signal
  // referenziert? Defensives Substring-Match, kein FK.
  has_active_reminder: boolean;
}

const MONTHS_DE: Record<string, number> = {
  januar: 0, jan: 0,
  februar: 1, feb: 1,
  märz: 2, maerz: 2, mar: 2, mrz: 2,
  april: 3, apr: 3,
  mai: 4,
  juni: 5, jun: 5,
  juli: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  oktober: 9, okt: 9, oct: 9,
  november: 10, nov: 10,
  dezember: 11, dez: 11, dec: 11,
};

// Best-effort Datums-Parser für Signal-Tag-Namen.
function parseSignalDate(tagName: string): string | null {
  const lower = tagName.toLowerCase();
  const now = new Date();
  const thisYear = now.getFullYear();

  // Pattern 1: vollständiges ISO (2025-05-14)
  const isoMatch = /(\d{4})-(\d{2})-(\d{2})/.exec(lower);
  if (isoMatch) return isoMatch[0];

  // Pattern 2: tag-monat als Wort ("26-march", "26-mai", "26 mai")
  const dayMonth = /(\d{1,2})[\s\-_./](january|jan|februar|feb|märz|maerz|mar|mrz|april|apr|may|mai|june|juni|jun|july|juli|jul|august|aug|september|sept|sep|october|oktober|okt|oct|november|nov|december|dezember|dez|dec)/i.exec(lower);
  if (dayMonth) {
    const day = parseInt(dayMonth[1], 10);
    const mon = MONTHS_DE[dayMonth[2].toLowerCase()] ?? null;
    if (mon !== null && day >= 1 && day <= 31) {
      let next = new Date(thisYear, mon, day);
      if (next < new Date(thisYear, now.getMonth(), now.getDate())) {
        next = new Date(thisYear + 1, mon, day);
      }
      return `${next.getFullYear()}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Pattern 3: tag-monat numerisch ("26-03", "26.03", "26/3")
  const numeric = /(\d{1,2})[\s\-_./](\d{1,2})(?:[\s\-_./](\d{2,4}))?/.exec(lower);
  if (numeric) {
    const day = parseInt(numeric[1], 10);
    const mon = parseInt(numeric[2], 10) - 1;
    if (mon >= 0 && mon <= 11 && day >= 1 && day <= 31) {
      const year = numeric[3]
        ? parseInt(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3], 10)
        : thisYear;
      let next = new Date(year, mon, day);
      if (!numeric[3] && next < new Date(thisYear, now.getMonth(), now.getDate())) {
        next = new Date(thisYear + 1, mon, day);
      }
      return `${next.getFullYear()}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Pattern 4: nur Jahr ("q3-2025", "2025-launch") → 1. Tag des Quartals
  const yearOnly = /(\d{4})/.exec(lower);
  const quarter = /q([1-4])/.exec(lower);
  if (yearOnly && quarter) {
    const year = parseInt(yearOnly[1], 10);
    const qStartMonth = (parseInt(quarter[1], 10) - 1) * 3;
    return `${year}-${String(qStartMonth + 1).padStart(2, "0")}-01`;
  }

  return null;
}

export async function listSignals(): Promise<SignalHit[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [ptRes, peopleRes, remRes] = await Promise.all([
    supabase
      .from("person_tags")
      .select("note, person_id, tags!inner(id, name, cluster)")
      .eq("tags.cluster", "reminders"),
    supabase
      .from("people")
      .select("id, name")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .eq("is_self", false),
    supabase
      .from("reminders")
      .select("text, person_id")
      .eq("user_id", user.id)
      .eq("status", "pending"),
  ]);

  if (ptRes.error) {
    console.error("[signals] list failed", ptRes.error);
    return [];
  }

  const peopleById = new Map<string, string>(
    (peopleRes.data ?? []).map((p) => [p.id as string, p.name as string]),
  );

  // Reminder-Texte pro Person als lower-cased Set für substring-Match.
  const remindersByPerson = new Map<string, string[]>();
  for (const r of (remRes.data ?? []) as {
    text: string;
    person_id: string | null;
  }[]) {
    if (!r.person_id) continue;
    if (!remindersByPerson.has(r.person_id)) {
      remindersByPerson.set(r.person_id, []);
    }
    remindersByPerson.get(r.person_id)!.push(r.text.toLowerCase());
  }

  type Row = {
    note: string | null;
    person_id: string;
    tags: { id: string; name: string; cluster: string } | null;
  };
  const rows = (ptRes.data ?? []) as unknown as Row[];

  const out: SignalHit[] = [];
  for (const row of rows) {
    if (!row.tags) continue;
    const personName = peopleById.get(row.person_id);
    if (!personName) continue;
    const tagLower = row.tags.name.toLowerCase();
    const remTexts = remindersByPerson.get(row.person_id) ?? [];
    const hasActiveReminder = remTexts.some((t) => t.includes(tagLower));
    out.push({
      tag_id: row.tags.id,
      tag_name: row.tags.name,
      person_id: row.person_id,
      person_name: personName,
      note: row.note,
      parsed_date: parseSignalDate(row.tags.name),
      has_active_reminder: hasActiveReminder,
    });
  }

  // Sortieren: zuerst die mit datums-naher Ankerung, danach Rest alphabetisch.
  out.sort((a, b) => {
    if (a.parsed_date && b.parsed_date) {
      return a.parsed_date.localeCompare(b.parsed_date);
    }
    if (a.parsed_date) return -1;
    if (b.parsed_date) return 1;
    return a.tag_name.localeCompare(b.tag_name);
  });

  return out;
}
