// Helper-Funktionen für das neue Tags-System (Phase A2).
//
// Die alte text[]-Variante (people.tags) bleibt parallel verfügbar
// bis Phase F. Reads gehen ab jetzt durch diese Library + die neue
// Tabelle; das alte Array wird zwar noch geschrieben (Spalten-Kompat
// für nicht-migrierte Code-Pfade), spielt aber funktional keine
// Rolle mehr.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type {
  TagCluster,
  TagCreatedBy,
  TagRow,
  TagWithNote,
} from "@/lib/types";

// Cookie-less callers (Siri capture) inject the service-role admin client
// plus an explicit userId, since there's no session to derive auth.uid()
// from. Default path stays cookie-bound + RLS-scoped.
interface TagClientOverride {
  client?: SupabaseClient;
  userId?: string;
}

/**
 * Idempotent: holt das Tag wenn's existiert, sonst legt es an.
 * Name wird case-insensitive verglichen (lower(name) ist unique).
 */
export async function getOrCreateTag(input: {
  name: string;
  cluster?: TagCluster;
  createdBy?: TagCreatedBy;
  override?: TagClientOverride;
}): Promise<TagRow | null> {
  const supabase = input.override?.client ?? (await createClient());
  let userId = input.override?.userId;
  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
  }
  const user = { id: userId };

  const trimmed = input.name.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  const cluster = input.cluster ?? "interests";

  // Lookup by name AND cluster: tag identity is (user_id, lower(name),
  // cluster) since the cross-fill fix (migration 0039). A name can live
  // independently in different clusters, so we must scope the lookup by
  // cluster — otherwise a name-only .maybeSingle() can match multiple
  // rows (→ error) or return the wrong-cluster tag.
  const { data: existing } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", user.id)
    .eq("name", normalized)
    .eq("cluster", cluster)
    .maybeSingle();

  if (existing) return existing as TagRow;

  // Insert. Race-Condition-safe via the (user_id, lower(name), cluster)
  // unique index — on conflict we re-select the same (name, cluster).
  const { data: inserted, error } = await supabase
    .from("tags")
    .insert({
      user_id: user.id,
      name: normalized,
      cluster,
      created_by: input.createdBy ?? "user",
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: retry } = await supabase
        .from("tags")
        .select("*")
        .eq("user_id", user.id)
        .eq("name", normalized)
        .eq("cluster", cluster)
        .maybeSingle();
      return (retry as TagRow) ?? null;
    }
    console.error("[tags] getOrCreateTag failed", error);
    return null;
  }
  return inserted as TagRow;
}

/**
 * Verknüpft Tag mit Person. Das frühere 7-Tag-Limit (Trigger) wurde in
 * Migration 0043 entfernt — kein Limit mehr.
 */
export async function addTagToPerson(
  personId: string,
  tagId: string,
  client?: SupabaseClient,
): Promise<{ ok: boolean; reason?: "duplicate" | "error" }> {
  const supabase = client ?? (await createClient());
  const { error } = await supabase
    .from("person_tags")
    .insert({ person_id: personId, tag_id: tagId });

  if (!error) return { ok: true };

  if (error.code === "23505") {
    // Schon dranne — kein echter Fehler.
    return { ok: true };
  }
  console.error("[tags] addTagToPerson failed", error);
  return { ok: false, reason: "error" };
}

export async function removeTagFromPerson(
  personId: string,
  tagId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("person_tags")
    .delete()
    .eq("person_id", personId)
    .eq("tag_id", tagId);
  if (error) {
    console.error("[tags] removeTagFromPerson failed", error);
    return false;
  }
  return true;
}

export async function listTagsForPerson(
  personId: string,
): Promise<TagRow[]> {
  const supabase = await createClient();
  // Inner join via tag_id — supabase-js syntax für "fetch related rows".
  const { data, error } = await supabase
    .from("person_tags")
    .select("tags(*)")
    .eq("person_id", personId);

  if (error) {
    console.error("[tags] listTagsForPerson failed", error);
    return [];
  }
  // Supabase typing kennt die join-Struktur nicht ohne Codegen — der
  // unknown-Zwischenschritt ist nötig weil supabase-js bei joins
  // generisch `any[]` zurückgibt.
  const rows = (data ?? []) as unknown as { tags: TagRow | null }[];
  return rows
    .map((r) => r.tags)
    .filter((t): t is TagRow => t !== null);
}

/**
 * Wie listTagsForPerson, aber liefert zusätzlich die per-Person-Note
 * aus person_tags.note (0028). Für den Cluster-Editor + Person-Detail-View.
 */
export async function listTagsWithNotesForPerson(
  personId: string,
): Promise<TagWithNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_tags")
    .select("note, tags(id, name, cluster)")
    .eq("person_id", personId);

  if (error) {
    console.error("[tags] listTagsWithNotesForPerson failed", error);
    return [];
  }
  const rows = (data ?? []) as unknown as {
    note: string | null;
    tags: { id: string; name: string; cluster: TagCluster } | null;
  }[];
  return rows
    .filter((r): r is typeof r & { tags: { id: string; name: string; cluster: TagCluster } } =>
      r.tags !== null,
    )
    .map((r) => ({
      id: r.tags.id,
      name: r.tags.name,
      cluster: r.tags.cluster,
      note: r.note,
    }));
}

/**
 * Pro-Person-Note auf person_tags setzen oder löschen.
 * Leerer String → null (kein Datensatz mit "" speichern).
 */
export async function updatePersonTagNote(
  personId: string,
  tagId: string,
  note: string | null,
): Promise<boolean> {
  const supabase = await createClient();
  const normalized = note?.trim() ? note.trim() : null;
  const { error } = await supabase
    .from("person_tags")
    .update({ note: normalized })
    .eq("person_id", personId)
    .eq("tag_id", tagId);
  if (error) {
    console.error("[tags] updatePersonTagNote failed", error);
    return false;
  }
  return true;
}

export async function listAllTags(): Promise<TagRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", user.id)
    .order("usage_count", { ascending: false });

  if (error) {
    console.error("[tags] listAllTags failed", error);
    return [];
  }
  return (data ?? []) as TagRow[];
}

/**
 * Cluster eines Tags ändern. Wird benutzt wenn User eine
 * tag-cluster-suggestion akzeptiert. Per RLS implicitly user-scoped.
 */
export async function updateTagCluster(
  tagId: string,
  cluster: TagCluster,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .update({ cluster, updated_at: new Date().toISOString() })
    .eq("id", tagId);
  if (error) {
    console.error("[tags] updateTagCluster failed", error);
    return false;
  }
  return true;
}
