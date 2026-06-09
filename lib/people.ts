import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";

// Fetches all non-deleted, non-self people for the current user.
// The self-person is excluded — it has its own /profile entry point.
export async function listPeople(): Promise<Person[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .is("deleted_at", null)
    .eq("is_self", false)
    .order("name", { ascending: true })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as Person[];
}

// Returns the self-person for the current user. Creates one on first
// access (named after profiles.display_name when available, else from
// the auth email local-part).
export async function getOrCreateSelfPerson(): Promise<Person> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const existing = await supabase
    .from("people")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_self", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as Person;

  const profileRes = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const name =
    profileRes.data?.display_name ??
    user.email?.split("@")[0] ??
    "Ich";

  const inserted = await supabase
    .from("people")
    .insert({
      user_id: user.id,
      name,
      is_self: true,
      purpose: "personal",
    })
    .select("*")
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data as Person;
}

// listAllTags + findSimilarPeople wurden in 0025 entfernt — die alten
// text[]-Tags auf people sind weg. Ersatz via lib/tags.ts (tags-Tabelle)
// kommt mit Phase c. Bis dahin liefern wir leere Listen damit Callsites
// kompilieren.

export async function listAllTags(): Promise<string[]> {
  return [];
}

export async function findSimilarPeople(
  _personId: string,
  _tags: string[],
  _limit = 6,
): Promise<Array<{ person: Person; shared: string[] }>> {
  return [];
}

// Listet alle Personen mit den Tag-Clustern, Passions und Circles in
// denen sie stecken — angereichert via Joins. Wird vom People-Liste-
// Filter + Cluster-Spalten gebraucht.
export interface PersonWithContext {
  person: Person;
  // Tag-Namen pro Cluster. Key = cluster-Wert (reminders/interests/
  // potential/origin), value = sortierte Array von Tag-Namen.
  tagsByCluster: Record<string, string[]>;
  // 0028 — Notes pro Tag-Name (für Tooltip in People-Liste).
  // Key = Tag-Name, Value = Person-spezifische Note.
  tagNotes: Record<string, string>;
  passions: Set<string>;     // Passion-Names (lower-cased für Match)
  passionNotes: Record<string, string>; // 0028 — lower-cased Name → Note
  circleIds: Set<string>;
  circleNotes: Record<string, string>;  // 0028 — circle_id → Note
  // 0030 — V3-Schema. cityList = alle aktiven Geo-Cities (lower) für
  // Location-Filter; contactChannels = Set der vorhandenen Channels
  // für Kanal-Filter.
  cityList: Set<string>;
  contactChannels: Set<string>;
}

export async function listPeopleWithContext(): Promise<PersonWithContext[]> {
  const supabase = await createClient();
  // V3-Migration (0030): jetzt auch person_contacts + person_geographies
  // mit-fetchen für Channel-/Location-Filter ohne JSONB-Abhängigkeit.
  const [peopleRes, ptRes, pasRes, pcRes, contactsRes, geoRes] =
    await Promise.all([
      supabase
        .from("people")
        .select("*")
        .is("deleted_at", null)
        .eq("is_self", false)
        .order("name", { ascending: true })
        .limit(500),
      supabase.from("person_tags").select("person_id, note, tags(cluster, name)").limit(500),
      supabase.from("passions").select("person_id, name, note").limit(500),
      supabase.from("person_circles").select("person_id, circle_id, note").limit(500),
      supabase.from("person_contacts").select("person_id, channel").limit(500),
      supabase
        .from("person_geographies")
        .select("person_id, city, display_name, country_code")
        .eq("is_active", true)
        .limit(500),
    ]);

  if (peopleRes.error) throw peopleRes.error;

  // Index person_id → cluster → tag-names
  const tagMap = new Map<string, Map<string, Set<string>>>();
  // Index person_id → tag-name → note (0028)
  const tagNoteMap = new Map<string, Map<string, string>>();
  const ptRows = (ptRes.data ?? []) as unknown as {
    person_id: string;
    note: string | null;
    tags: { cluster: string; name: string } | null;
  }[];
  for (const row of ptRows) {
    if (!row.tags?.cluster || !row.tags.name) continue;
    if (!tagMap.has(row.person_id)) tagMap.set(row.person_id, new Map());
    const cm = tagMap.get(row.person_id)!;
    if (!cm.has(row.tags.cluster)) cm.set(row.tags.cluster, new Set());
    cm.get(row.tags.cluster)!.add(row.tags.name);
    if (row.note && row.note.trim()) {
      if (!tagNoteMap.has(row.person_id)) tagNoteMap.set(row.person_id, new Map());
      tagNoteMap.get(row.person_id)!.set(row.tags.name, row.note.trim());
    }
  }

  // Index person_id → passion-names set (lower-cased) + per-passion Note
  const passionMap = new Map<string, Set<string>>();
  const passionNoteMap = new Map<string, Map<string, string>>();
  const pasRows = (pasRes.data ?? []) as {
    person_id: string;
    name: string;
    note: string | null;
  }[];
  for (const row of pasRows) {
    if (!row.name) continue;
    const lower = row.name.toLowerCase();
    if (!passionMap.has(row.person_id)) passionMap.set(row.person_id, new Set());
    passionMap.get(row.person_id)!.add(lower);
    if (row.note && row.note.trim()) {
      if (!passionNoteMap.has(row.person_id))
        passionNoteMap.set(row.person_id, new Map());
      passionNoteMap.get(row.person_id)!.set(lower, row.note.trim());
    }
  }

  // Index person_id → circleIds set + per-circle Note
  const circleMap = new Map<string, Set<string>>();
  const circleNoteMap = new Map<string, Map<string, string>>();
  const pcRows = (pcRes.data ?? []) as {
    person_id: string;
    circle_id: string;
    note: string | null;
  }[];
  for (const row of pcRows) {
    if (!circleMap.has(row.person_id)) circleMap.set(row.person_id, new Set());
    circleMap.get(row.person_id)!.add(row.circle_id);
    if (row.note && row.note.trim()) {
      if (!circleNoteMap.has(row.person_id))
        circleNoteMap.set(row.person_id, new Map());
      circleNoteMap.get(row.person_id)!.set(row.circle_id, row.note.trim());
    }
  }

  // 0030 — Channels pro Person + Cities pro Person aggregieren
  const channelMap = new Map<string, Set<string>>();
  for (const row of (contactsRes.data ?? []) as {
    person_id: string;
    channel: string;
  }[]) {
    if (!channelMap.has(row.person_id)) channelMap.set(row.person_id, new Set());
    channelMap.get(row.person_id)!.add(row.channel);
  }

  const cityMap = new Map<string, Set<string>>();
  for (const row of (geoRes.data ?? []) as {
    person_id: string;
    city: string | null;
    display_name: string;
    country_code: string | null;
  }[]) {
    if (!cityMap.has(row.person_id)) cityMap.set(row.person_id, new Set());
    const s = cityMap.get(row.person_id)!;
    // Mehrere matchbare Werte: city + display_name (für Voice-Filter)
    if (row.city) s.add(row.city.toLowerCase());
    if (row.display_name) s.add(row.display_name.toLowerCase());
    if (row.country_code) s.add(row.country_code.toLowerCase());
  }

  return ((peopleRes.data ?? []) as Person[]).map((p) => {
    const cm = tagMap.get(p.id);
    const tagsByCluster: Record<string, string[]> = {};
    if (cm) {
      for (const [cluster, names] of cm.entries()) {
        tagsByCluster[cluster] = Array.from(names).sort((a, b) =>
          a.localeCompare(b),
        );
      }
    }
    return {
      person: p,
      tagsByCluster,
      tagNotes: Object.fromEntries(tagNoteMap.get(p.id) ?? []),
      passions: passionMap.get(p.id) ?? new Set(),
      passionNotes: Object.fromEntries(passionNoteMap.get(p.id) ?? []),
      circleIds: circleMap.get(p.id) ?? new Set(),
      circleNotes: Object.fromEntries(circleNoteMap.get(p.id) ?? []),
      cityList: cityMap.get(p.id) ?? new Set(),
      contactChannels: channelMap.get(p.id) ?? new Set(),
    };
  });
}

// Lightweight picker list — only id + name, excludes self and deleted.
// Use this instead of listPeople() whenever only id/name are needed
// (e.g. relationship pickers) to avoid fetching all columns.
export async function listPeopleIdName(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("id, name")
    .is("deleted_at", null)
    .eq("is_self", false)
    .order("name");
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

// Returns the person, or null if not found / soft-deleted / not owned.
export async function getPersonById(id: string): Promise<Person | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data as Person | null;
}
