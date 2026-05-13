// Helper-Funktionen für person_relationships (V3-Schema, Migration 0030).
//
// Phase 1: Symmetrie wird App-seitig hier verwaltet — siehe
// SYMMETRIC_RECIPROCAL für die Mapping-Tabelle.

import { createClient } from "@/lib/supabase/server";
import type { PersonRelationship, RelationshipType } from "@/lib/types";

// Für symmetrische Beziehungen den reziproken Typ. Wenn A → B ist
// X, dann B → A ist Y. Beispiel: parent ↔ child.
//
// Reine Selbst-Symmetrie (z. B. friend ↔ friend) wird identisch gemapped.
const SYMMETRIC_RECIPROCAL: Partial<Record<RelationshipType, RelationshipType>> = {
  // Ehe + Partnerschaft beidseitig identisch
  spouse: "spouse",
  partner: "partner",
  // Generationen: parent <-> child
  parent: "child",
  child: "parent",
  // Geschwister gegenseitig
  sibling: "sibling",
  // Beidseitig gleiche Bedeutung
  colleague: "colleague",
  co_founder: "co_founder",
  family: "family",
  friend: "friend",
  // mentor ↔ mentee
  mentor: "mentee",
  mentee: "mentor",
  // Asymmetrisch — bewusst nicht reziprok gespiegelt:
  //   introduced_by, former_manager, investor, advisor
};

export async function listRelationshipsForPerson(
  personId: string,
): Promise<PersonRelationship[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_relationships")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[relationships] list failed", error);
    return [];
  }
  return (data ?? []) as PersonRelationship[];
}

export interface CreateRelationshipInput {
  person_id: string;
  related_person_id: string;
  relationship_type: RelationshipType;
  label?: string | null;
  created_by?: "user" | "ai_suggested";
}

/**
 * Idempotente Beziehung anlegen + ggf. reziproke Beziehung auf der
 * Gegenseite spiegeln. Race-safe durch das Unique-Constraint
 * (person_id, related_person_id, relationship_type).
 */
export async function createRelationship(
  input: CreateRelationshipInput,
): Promise<PersonRelationship | null> {
  if (input.person_id === input.related_person_id) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("person_relationships")
    .insert({
      user_id: user.id,
      person_id: input.person_id,
      related_person_id: input.related_person_id,
      relationship_type: input.relationship_type,
      label: input.label ?? null,
      created_by: input.created_by ?? "user",
    })
    .select("*")
    .single();

  // 23505 = unique-Verletzung → existiert bereits, kein Fehler.
  if (error && error.code !== "23505") {
    console.error("[relationships] create failed", error);
    return null;
  }

  // Reziproke Seite spiegeln, wenn symmetrisch und noch nicht da.
  const reciprocal = SYMMETRIC_RECIPROCAL[input.relationship_type];
  if (reciprocal) {
    await supabase
      .from("person_relationships")
      .insert({
        user_id: user.id,
        person_id: input.related_person_id,
        related_person_id: input.person_id,
        relationship_type: reciprocal,
        label: input.label ?? null,
        created_by: input.created_by ?? "user",
      });
    // Fehler ignorieren — bei Race verlieren wir einfach, der andere
    // hat's schon eingelegt.
  }

  return (data as PersonRelationship) ?? null;
}

/**
 * Beziehung löschen — auch die reziproke wird mit entfernt wenn
 * symmetrisch (sonst hängt eine einseitige Geister-Verknüpfung).
 */
export async function deleteRelationship(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: target, error: fetchErr } = await supabase
    .from("person_relationships")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !target) {
    console.error("[relationships] fetch-before-delete failed", fetchErr);
    return false;
  }
  const t = target as PersonRelationship;
  const { error } = await supabase
    .from("person_relationships")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("[relationships] delete failed", error);
    return false;
  }
  // Reziproke löschen wenn symmetrisch.
  const reciprocal = SYMMETRIC_RECIPROCAL[t.relationship_type];
  if (reciprocal) {
    await supabase
      .from("person_relationships")
      .delete()
      .eq("person_id", t.related_person_id)
      .eq("related_person_id", t.person_id)
      .eq("relationship_type", reciprocal);
  }
  return true;
}

/**
 * Direkte Nachbarn im Beziehungsgraph einer Person. Für Phase 2
 * Warm-Intro-Discovery.
 */
export async function listNeighbors(personId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_relationships")
    .select("related_person_id")
    .eq("person_id", personId);
  if (error) {
    console.error("[relationships] neighbors failed", error);
    return [];
  }
  return (data ?? []).map((r) => r.related_person_id as string);
}
