// Helper-Queries für das Heute-Dashboard (/heute, Phase C4).

import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";

// People mit mode='reconnect' — Briefing v3 #19. Cron oder User
// markiert sie als „sollte ich wieder anpacken".
export async function listReconnectPeople(limit = 5): Promise<Person[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("mode", "reconnect")
    .eq("is_self", false)
    .is("deleted_at", null)
    .order("last_contact_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    console.error("[today] listReconnectPeople failed", error);
    return [];
  }
  return (data ?? []) as Person[];
}

interface BirthdayHit {
  person: Person;
  date: string;   // ISO date YYYY-MM-DD (next occurrence)
  daysAway: number;
}

// Geburtstage in den nächsten N Tagen aus important_dates JSONB.
// Wir filtern App-seitig weil DB-seitiges JSONB-Date-Math fummelig ist
// und Echo eh nicht 1000+ Personen hat. Bei skaliertem Workload
// würden wir eine view oder materialisierte Date-Spalte einführen.
export async function listUpcomingBirthdays(
  daysAhead = 7,
): Promise<BirthdayHit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("is_self", false)
    .is("deleted_at", null);
  if (error) {
    console.error("[today] listUpcomingBirthdays failed", error);
    return [];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const hits: BirthdayHit[] = [];
  for (const p of (data ?? []) as Person[]) {
    for (const evt of p.important_dates ?? []) {
      if (!evt.date) continue;
      const label = (evt.label ?? "").toLowerCase();
      const isBirthday = label.includes("geburt") || label.includes("birth");
      if (!isBirthday) continue;
      const [yy, mm, dd] = evt.date.split("-").map((x) => parseInt(x, 10));
      if (!mm || !dd) continue;

      // Nächstes Vorkommen — entweder dieses Jahr oder nächstes Jahr.
      let next = new Date(today.getFullYear(), mm - 1, dd);
      next.setHours(0, 0, 0, 0);
      if (next.getTime() < today.getTime()) {
        next = new Date(today.getFullYear() + 1, mm - 1, dd);
      }
      if (next.getTime() > cutoff.getTime()) continue;

      const daysAway = Math.round(
        (next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      hits.push({
        person: p,
        date: `${next.getFullYear()}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`,
        daysAway,
      });
    }
  }
  hits.sort((a, b) => a.daysAway - b.daysAway);
  return hits;
}

// People mit cadence_days gesetzt + last_contact_at + überfälliger
// next_nudge. Wir nutzen lib/cadence.ts's listCadenceRows als Quelle
// und filtern hier auf „drifting" oder „due-soon" + Mode = active.
export interface CadenceHit {
  person: Person;
  daysSince: number;
  bucket: "drifting" | "due-soon";
}

export async function listCadenceOverdue(limit = 5): Promise<CadenceHit[]> {
  const { listCadenceRows } = await import("@/lib/cadence");
  const all = await listCadenceRows();
  const hits: CadenceHit[] = [];
  for (const r of all) {
    if (r.bucket !== "drifting" && r.bucket !== "due-soon") continue;
    if (r.daysSince === null) continue;
    if (r.person.mode !== "active" && r.person.mode !== "nurture") continue;
    hits.push({
      person: r.person,
      daysSince: r.daysSince,
      bucket: r.bucket,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
