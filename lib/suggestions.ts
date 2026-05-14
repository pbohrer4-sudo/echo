// Helper-Funktionen für die suggestions-Approval-Queue.
//
// Schreib-Pfade (für AI-Pipelines): createSuggestion()
// Lese-Pfade (für UI): listPendingForPerson(), listAllPending(), listAllPendingCount()
// Approval-Pfade (für UI): accept(), reject(), dismiss()
//
// Wichtig: das eigentliche Anwenden eines accepted-Vorschlags (also der
// Schreib-Vorgang in people/interactions/notes) passiert NICHT hier. Diese
// Datei verwaltet nur die suggestions-Tabelle selbst. Die per-Type-
// Anwendungslogik kommt in lib/suggestion-apply.ts (Phase B), weil sie
// pro Suggestion-Type unterschiedlich ist (tag-suggestion verändert
// person_tags, merge_duplicate-suggestion verändert mehrere Tabellen
// in einer Transaction usw.).

import { createClient } from "@/lib/supabase/server";
import type {
  SuggestionRow,
  SuggestionStatus,
  SuggestionType,
} from "@/lib/types";

interface CreateSuggestionInput {
  person_id: string;
  suggestion_type: SuggestionType;
  payload: Record<string, unknown>;
  reasoning?: string | null;
}

/**
 * Schreib-Pfad für AI-Pipelines. Verwirft Duplikate (gleicher person_id +
 * suggestion_type + payload-Hash innerhalb der letzten 24h) damit der
 * Approval-Queue nicht zugespammt wird wenn der gleiche Cron mehrfach
 * läuft.
 */
export async function createSuggestion(
  input: CreateSuggestionInput,
): Promise<SuggestionRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Soft-Dedup: gleiche Suggestion in den letzten 24h für selbe Person
  // → wir überspringen den Insert. Spart Approval-Müll wenn AI mehrfach
  // dasselbe vorschlägt.
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("suggestions")
    .select("id, payload")
    .eq("user_id", user.id)
    .eq("person_id", input.person_id)
    .eq("suggestion_type", input.suggestion_type)
    .eq("status", "pending")
    .gte("created_at", sinceIso)
    .limit(20);

  if (existing && existing.length > 0) {
    const incomingJson = JSON.stringify(input.payload);
    const hasMatch = existing.some(
      (row) => JSON.stringify(row.payload) === incomingJson,
    );
    if (hasMatch) return null;
  }

  const { data, error } = await supabase
    .from("suggestions")
    .insert({
      user_id: user.id,
      person_id: input.person_id,
      suggestion_type: input.suggestion_type,
      payload: input.payload,
      reasoning: input.reasoning ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[suggestions] insert failed", error);
    return null;
  }
  return data as SuggestionRow;
}

export async function listPendingForPerson(
  personId: string,
): Promise<SuggestionRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("suggestions")
    .select("*")
    .eq("user_id", user.id)
    .eq("person_id", personId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[suggestions] listPendingForPerson failed", error);
    return [];
  }
  return (data ?? []) as SuggestionRow[];
}

/**
 * Alle pending Suggestions des Users — für Heute-Dashboard. Limitiert
 * weil das Dashboard nur die 5 jüngsten zeigt.
 */
export async function listAllPending(limit = 5): Promise<SuggestionRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("suggestions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[suggestions] listAllPending failed", error);
    return [];
  }
  return (data ?? []) as SuggestionRow[];
}

export async function countPending(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (error) {
    console.error("[suggestions] countPending failed", error);
    return 0;
  }
  return count ?? 0;
}

async function setStatus(
  id: string,
  status: SuggestionStatus,
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from("suggestions")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error(`[suggestions] setStatus(${status}) failed`, error);
    return false;
  }
  return true;
}

/**
 * Markiert die Suggestion als accepted. Wendet die Suggestion NICHT
 * automatisch an — der Caller muss die per-Type-Anwendungslogik selbst
 * triggern (Phase B: lib/suggestion-apply.ts).
 */
export async function accept(id: string): Promise<boolean> {
  return setStatus(id, "accepted");
}

export async function reject(id: string): Promise<boolean> {
  return setStatus(id, "rejected");
}

/**
 * Dismiss = nicht jetzt, vielleicht später. Im Unterschied zu reject
 * blockiert dismiss nicht die Re-Generierung — die AI kann den
 * gleichen Vorschlag in 24h wieder machen (nur dedupliziert wir auf
 * pending, nicht auf dismissed).
 */
export async function dismiss(id: string): Promise<boolean> {
  return setStatus(id, "dismissed");
}
