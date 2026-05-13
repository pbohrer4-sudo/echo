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
