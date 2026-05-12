// Helper-Funktionen für das neue Tags-System (Phase A2).
//
// Die alte text[]-Variante (people.tags) bleibt parallel verfügbar
// bis Phase F. Reads gehen ab jetzt durch diese Library + die neue
// Tabelle; das alte Array wird zwar noch geschrieben (Spalten-Kompat
// für nicht-migrierte Code-Pfade), spielt aber funktional keine
// Rolle mehr.

import { createClient } from "@/lib/supabase/server";
import type { TagCluster, TagCreatedBy, TagRow } from "@/lib/types";

/**
 * Idempotent: holt das Tag wenn's existiert, sonst legt es an.
 * Name wird case-insensitive verglichen (lower(name) ist unique).
 */
export async function getOrCreateTag(input: {
  name: string;
  cluster?: TagCluster;
  createdBy?: TagCreatedBy;
}): Promise<TagRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const trimmed = input.name.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();

  // Erst Lookup — wenn existiert, einfach zurückgeben.
  const { data: existing } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", user.id)
    .eq("name", normalized)
    .maybeSingle();

  if (existing) return existing as TagRow;

  // Insert. Race-Condition-safe durch unique-constraint — falls zwei
  // Parallel-Calls den gleichen Tag anlegen wollen, gewinnt einer und
  // wir holen den anderen per Re-Select.
  const { data: inserted, error } = await supabase
    .from("tags")
    .insert({
      user_id: user.id,
      name: normalized,
      cluster: input.cluster ?? "topic",
      created_by: input.createdBy ?? "user",
    })
    .select("*")
    .single();

  if (error) {
    // 23505 = unique_violation → jemand anders war schneller. Re-Select.
    if (error.code === "23505") {
      const { data: retry } = await supabase
        .from("tags")
        .select("*")
        .eq("user_id", user.id)
        .eq("name", normalized)
        .maybeSingle();
      return (retry as TagRow) ?? null;
    }
    console.error("[tags] getOrCreateTag failed", error);
    return null;
  }
  return inserted as TagRow;
}

/**
 * Verknüpft Tag mit Person. Trigger erzwingt 7-Tag-Limit pro Person.
 * Bei Limit-Verletzung wird false zurückgegeben, kein Throw.
 */
export async function addTagToPerson(
  personId: string,
  tagId: string,
): Promise<{ ok: boolean; reason?: "limit" | "duplicate" | "error" }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("person_tags")
    .insert({ person_id: personId, tag_id: tagId });

  if (!error) return { ok: true };

  // P0001 = Postgres raise exception (vom Limit-Trigger)
  if (error.message?.includes("maximum of 7 tags")) {
    return { ok: false, reason: "limit" };
  }
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
