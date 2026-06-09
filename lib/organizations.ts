import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Organization, Person } from "@/lib/types";

export interface OrgWithCount extends Organization {
  people_count: number;
}

// Minimal client shape resolveOrCreateOrganization needs — satisfied by
// both the cookie-bound server client and the service-role admin client.
type OrgSupabaseClient = SupabaseClient;

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
// a new row when there's no case-insensitive match. Race-safe: relies
// on the partial unique index on (user_id, lower(trim(name))) added
// in migration 0012. Returns null when companyName is null/empty.
export async function resolveOrCreateOrganization(
  companyName: string | null,
  userId: string,
  // Optional injected client. Cookie-less callers (e.g. the Siri capture
  // endpoint) pass the service-role admin client; everyone else gets the
  // RLS-scoped session client by default.
  client?: OrgSupabaseClient,
): Promise<string | null> {
  if (!companyName) return null;
  const trimmed = companyName.trim();
  if (!trimmed) return null;

  const supabase = client ?? (await createClient());
  const { data: matches, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("user_id", userId)
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

  // Concurrent insert lost the race against the unique index — re-read.
  if (inserted.error && (inserted.error as { code?: string }).code === "23505") {
    const { data: retry } = await supabase
      .from("organizations")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .ilike("name", trimmed)
      .limit(1)
      .single();
    if (retry) return (retry as { id: string }).id;
  }
  if (inserted.error) throw inserted.error;
  return (inserted.data as { id: string }).id;
}
