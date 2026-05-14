// Lädt einen reichhaltigen Personen-Snapshot für die System-Prompts
// von /api/chat und /api/extract. Vorher haben die Endpoints nur
// (id, name, company) reingegeben — Claude konnte nicht antworten
// wenn der User nach Geschenkideen, Tags, Passions oder Beziehungen
// gefragt hat (sah aus als wäre das CRM leer obwohl gefüllt).
//
// Wir batchen die zusätzlichen Daten in fünf Multi-IN-Queries statt
// pro Person zu loopen. Tabellen die noch nicht auf der Remote-DB
// existieren (Migration-Drift) werden defensiv abgefangen — der
// Hauptpfad (people-Skalare) bleibt funktional auch wenn z.B.
// person_relationships fehlt.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonContext } from "@/lib/prompts";

interface BasePerson {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  gift_idea: string | null;
  notes: string | null;
  how_we_met: string | null;
}

interface TagRow {
  person_id: string;
  tags: { name: string; cluster: string } | null;
}

interface PassionRow {
  person_id: string;
  name: string;
  emoji: string | null;
}

interface ContactRow {
  person_id: string;
  channel: string;
  value: string;
  subtype: string | null;
  is_primary: boolean;
}

interface RelationshipRow {
  person_id: string;
  related_person_id: string;
  relationship_type: string;
  label: string | null;
}

interface LifeEventRow {
  person_id: string;
  life_events: { title: string; occurred_at: string; event_type: string } | null;
}

export async function loadPeopleContext(
  supabase: SupabaseClient,
  limit: number,
): Promise<PersonContext[]> {
  // 1) Basis-Skalare. Wenn das schiefgeht, gibt's nichts zu rendern.
  const { data: peopleData, error } = await supabase
    .from("people")
    .select(
      "id, name, company, role, gift_idea, notes, how_we_met",
    )
    .is("deleted_at", null)
    .eq("is_self", false)
    .order("last_contact_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error || !peopleData) return [];

  const base = peopleData as BasePerson[];
  const ids = base.map((p) => p.id);
  if (ids.length === 0) return [];

  // 2) Parallele Aggregations-Queries. Jede separat behandelt damit
  //    eine fehlende Tabelle (Migration-Drift) nicht alles killt.
  const [tagsRes, passionsRes, contactsRes, relsRes, lifeRes, nameMapRes] =
    await Promise.all([
      supabase
        .from("person_tags")
        .select("person_id, tags(name, cluster)")
        .in("person_id", ids),
      supabase
        .from("passions")
        .select("person_id, name, emoji")
        .in("person_id", ids)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("person_contacts")
        .select("person_id, channel, value, subtype, is_primary")
        .in("person_id", ids)
        .order("is_primary", { ascending: false }),
      supabase
        .from("person_relationships")
        .select("person_id, related_person_id, relationship_type, label")
        .in("person_id", ids),
      supabase
        .from("person_life_events")
        .select(
          "person_id, life_events(title, occurred_at, event_type)",
        )
        .in("person_id", ids),
      // Name-Lookup für related_person_id → readable name. Wir holen
      // ALLE Personen-Namen (klein) damit Beziehungen zu Personen
      // außerhalb der top-60 trotzdem renderbar sind.
      supabase
        .from("people")
        .select("id, name")
        .is("deleted_at", null),
    ]);

  const tagsByPerson = groupBy<TagRow>(
    (tagsRes.data as TagRow[] | null) ?? [],
    (r) => r.person_id,
  );
  const passionsByPerson = groupBy<PassionRow>(
    (passionsRes.data as PassionRow[] | null) ?? [],
    (r) => r.person_id,
  );
  const contactsByPerson = groupBy<ContactRow>(
    (contactsRes.data as ContactRow[] | null) ?? [],
    (r) => r.person_id,
  );
  const relsByPerson = groupBy<RelationshipRow>(
    (relsRes.data as RelationshipRow[] | null) ?? [],
    (r) => r.person_id,
  );
  const lifeByPerson = groupBy<LifeEventRow>(
    (lifeRes.data as LifeEventRow[] | null) ?? [],
    (r) => r.person_id,
  );
  const nameMap = new Map<string, string>();
  for (const row of (nameMapRes.data as { id: string; name: string }[] | null) ?? []) {
    nameMap.set(row.id, row.name);
  }

  return base.map((p): PersonContext => ({
    id: p.id,
    name: p.name,
    company: p.company,
    role: p.role,
    gift_idea: p.gift_idea,
    notes: p.notes,
    how_we_met: p.how_we_met,
    tags: collectTagNames(tagsByPerson.get(p.id) ?? []),
    passions: (passionsByPerson.get(p.id) ?? [])
      .map((pp) => (pp.emoji ? `${pp.emoji} ${pp.name}` : pp.name))
      .slice(0, 8),
    contacts: (contactsByPerson.get(p.id) ?? [])
      .map((c) => ({
        channel: c.channel,
        value: c.value,
        subtype: c.subtype,
      }))
      .slice(0, 8),
    relationships: (relsByPerson.get(p.id) ?? [])
      .map((r) => ({
        label:
          r.label && r.label.trim()
            ? r.label
            : prettyType(r.relationship_type),
        related_name: nameMap.get(r.related_person_id) ?? null,
      }))
      .filter((r) => r.related_name)
      .slice(0, 6),
    life_events: (lifeByPerson.get(p.id) ?? [])
      .filter((r) => r.life_events)
      .map((r) => ({
        title: r.life_events!.title,
        date: r.life_events!.occurred_at,
        kind: r.life_events!.event_type,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4),
  }));
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

function collectTagNames(rows: TagRow[]): { name: string; cluster: string }[] {
  const out: { name: string; cluster: string }[] = [];
  for (const r of rows) {
    if (!r.tags) continue;
    out.push({ name: r.tags.name, cluster: r.tags.cluster });
  }
  return out.slice(0, 12);
}

function prettyType(t: string): string {
  switch (t) {
    case "spouse":
      return "Ehepartner:in";
    case "partner":
      return "Partner:in";
    case "parent":
      return "Elternteil";
    case "child":
      return "Kind";
    case "sibling":
      return "Geschwister";
    case "friend":
      return "Freund:in";
    case "colleague":
      return "Kolleg:in";
    case "mentor":
      return "Mentor:in";
    case "mentee":
      return "Mentee";
    case "co_founder":
      return "Co-Founder";
    case "former_manager":
      return "Ehem. Vorgesetzte:r";
    case "investor":
      return "Investor:in";
    case "advisor":
      return "Advisor";
    case "introduced_by":
      return "Vermittelt durch";
    case "family":
      return "Familie";
    default:
      return t;
  }
}
