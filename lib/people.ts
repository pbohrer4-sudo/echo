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
    .order("name", { ascending: true });

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

// Listet alle Personen mit den Tag-Clustern und Circles in denen sie
// stecken — angereichert via Joins. Wird vom People-Liste-Filter
// gebraucht (filter nach Cluster oder Circle).
export interface PersonWithContext {
  person: Person;
  clusters: Set<string>; // welche der 4 Tag-Cluster diese Person hat
  circleIds: Set<string>;
}

export async function listPeopleWithContext(): Promise<PersonWithContext[]> {
  const supabase = await createClient();
  const [peopleRes, ptRes, pcRes] = await Promise.all([
    supabase
      .from("people")
      .select("*")
      .is("deleted_at", null)
      .eq("is_self", false)
      .order("name", { ascending: true }),
    supabase
      .from("person_tags")
      .select("person_id, tags(cluster)"),
    supabase.from("person_circles").select("person_id, circle_id"),
  ]);

  if (peopleRes.error) throw peopleRes.error;

  // Index person_id → clusters set
  const clusterMap = new Map<string, Set<string>>();
  const ptRows = (ptRes.data ?? []) as unknown as {
    person_id: string;
    tags: { cluster: string } | null;
  }[];
  for (const row of ptRows) {
    if (!row.tags?.cluster) continue;
    if (!clusterMap.has(row.person_id)) {
      clusterMap.set(row.person_id, new Set());
    }
    clusterMap.get(row.person_id)!.add(row.tags.cluster);
  }

  // Index person_id → circleIds set
  const circleMap = new Map<string, Set<string>>();
  const pcRows = (pcRes.data ?? []) as {
    person_id: string;
    circle_id: string;
  }[];
  for (const row of pcRows) {
    if (!circleMap.has(row.person_id)) {
      circleMap.set(row.person_id, new Set());
    }
    circleMap.get(row.person_id)!.add(row.circle_id);
  }

  return ((peopleRes.data ?? []) as Person[]).map((p) => ({
    person: p,
    clusters: clusterMap.get(p.id) ?? new Set(),
    circleIds: circleMap.get(p.id) ?? new Set(),
  }));
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
