"use server";

// Server Actions für Suggestion-Approval (Phase C3 + B1).
//
// acceptSuggestionAction (Phase B1): lädt die Suggestion, ruft
// applySuggestion auf um die echte Änderung auf der Ziel-Tabelle
// zu schreiben, und setzt den Status erst NACH erfolgreichem Apply.
// Bei Fehler bleibt der Status auf 'pending' — User sieht den Fehler
// im UI und kann ggf. erneut versuchen oder ablehnen.
//
// reject/dismiss machen kein Apply, nur Status-Updates.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { applySuggestion } from "@/lib/suggestion-apply";
import {
  reject as rejectSuggestion,
  dismiss as dismissSuggestion,
} from "@/lib/suggestions";
import type { SuggestionRow } from "@/lib/types";

export async function acceptSuggestionAction(
  suggestionId: string,
  personId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Nicht eingeloggt" };
  }

  // Suggestion laden (mit user_id-Filter via RLS — wird automatisch
  // gefiltert, aber wir lesen die Row für Apply-Payload).
  const { data: suggestion, error: loadErr } = await supabase
    .from("suggestions")
    .select("*")
    .eq("id", suggestionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!suggestion) return { ok: false, error: "Vorschlag nicht gefunden" };

  // Apply-Logik laufen lassen.
  const applyResult = await applySuggestion(suggestion as SuggestionRow);
  if (!applyResult.ok) {
    return {
      ok: false,
      error: applyResult.error ?? "Anwenden fehlgeschlagen",
    };
  }

  // Erst nach erfolgreichem Apply den Status updaten.
  const { error: statusErr } = await supabase
    .from("suggestions")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", suggestionId)
    .eq("user_id", user.id);
  if (statusErr) {
    // Apply ist durch, Status-Update gescheitert — inkonsistenter
    // State. Loggen aber kein Fail nach außen, sonst denkt User
    // Apply wäre nicht passiert.
    console.error(
      "[suggestion-accept] Apply ok, Status-Update fail:",
      statusErr,
    );
  }

  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

export async function rejectSuggestionAction(
  suggestionId: string,
  personId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ok = await rejectSuggestion(suggestionId);
  if (!ok) return { ok: false, error: "Ablehnen fehlgeschlagen" };
  revalidatePath(`/people/${personId}`);
  return { ok };
}

export async function dismissSuggestionAction(
  suggestionId: string,
  personId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ok = await dismissSuggestion(suggestionId);
  if (!ok) return { ok: false, error: "Verschieben fehlgeschlagen" };
  revalidatePath(`/people/${personId}`);
  return { ok };
}
