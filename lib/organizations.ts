import { createClient } from "@/lib/supabase/server";
import type { Organization, Person } from "@/lib/types";

export interface OrgWithCount extends Organization {
  people_count: number;
}

// All non-deleted orgs for the user, with people_count rolled up.
export async function listOrganizations(): Promise<OrgWithCount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw error;

  const orgs = (data ?? []) as Organization[];
  if (orgs.length === 0) return [];

  // Count people per organization in a single query.
  const { data: peopleRows, error: peopleError } = await supabase
    .from("people")
    .select("organization_id")
    .is("deleted_at", null)
    .eq("is_self", false)
    .in(
      "organization_id",
      orgs.map((o) => o.id),
    );
  if (peopleError) throw peopleError;

  const counts = new Map<string, number>();
  for (const row of (peopleRows ?? []) as { organization_id: string }[]) {
    counts.set(
      row.organization_id,
      (counts.get(row.organization_id) ?? 0) + 1,
    );
  }

  return orgs.map((o) => ({ ...o, people_count: counts.get(o.id) ?? 0 }));
}

export async function getOrganizationById(
  id: string,
): Promise<Organization | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as Organization) ?? null;
}

export async function listPeopleForOrganization(
  orgId: string,
): Promise<Person[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .eq("is_self", false)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Person[];
}

// All unique tags currently in use across the user's organizations.
export async function listAllOrganizationTags(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
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

// Used by the person form's company input — autocomplete from existing
// orgs (case-insensitive prefix match).
export async function autocompleteOrganizations(
  query: string,
  limit = 8,
): Promise<{ id: string; name: string }[]> {
  if (!query.trim()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .is("deleted_at", null)
    .ilike("name", `${query}%`)
    .order("name", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

// Resolve a free-text company name to an organization_id, creating
// a new row when there's no case-insensitive match. Idempotent.
// Returns null when companyName is null/empty.
export async function resolveOrCreateOrganization(
  companyName: string | null,
  userId: string,
): Promise<string | null> {
  if (!companyName) return null;
  const trimmed = companyName.trim();
  if (!trimmed) return null;

  const supabase = await createClient();
  const { data: matches, error } = await supabase
    .from("organizations")
    .select("id")
    .is("deleted_at", null)
    .ilike("name", trimmed)
    .limit(1);
  if (error) throw error;

  if (matches && matches.length > 0) {
    return (matches[0] as { id: string }).id;
  }

  const inserted = await supabase
    .from("organizations")
    .insert({ user_id: userId, name: trimmed })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return (inserted.data as { id: string }).id;
}
