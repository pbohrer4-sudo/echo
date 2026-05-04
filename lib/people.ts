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
      scope: "both",
      is_self: true,
    })
    .select("*")
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data as Person;
}

// Returns all unique tags currently in use across the user's people,
// sorted case-insensitively. Used to populate tag autocomplete in the
// person form.
export async function listAllTags(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("tags")
    .is("deleted_at", null);
  if (error) throw error;
  const set = new Set<string>();
  for (const row of data ?? []) {
    for (const t of (row.tags ?? []) as string[]) {
      if (t) set.add(t);
    }
  }
  return Array.from(set).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
}

// Find people who share at least one tag with the given person, sorted
// by overlap count desc. Self-row and the input person are excluded.
export async function findSimilarPeople(
  personId: string,
  tags: string[],
  limit = 6,
): Promise<Array<{ person: Person; shared: string[] }>> {
  if (tags.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .neq("id", personId)
    .eq("is_self", false)
    .is("deleted_at", null)
    .overlaps("tags", tags);
  if (error) throw error;

  const lower = new Set(tags.map((t) => t.toLowerCase()));
  return (data as Person[])
    .map((person) => {
      const shared = (person.tags ?? []).filter((t) =>
        lower.has(t.toLowerCase()),
      );
      return { person, shared };
    })
    .filter((row) => row.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length)
    .slice(0, limit);
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
