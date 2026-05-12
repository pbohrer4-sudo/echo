"use server";

// Server Actions für Suggestion-Approval (Phase C3).
//
// C3 setzt nur den Status auf der suggestions-Tabelle — die eigentliche
// per-Type-Anwendungslogik (z.B. Tag-Cluster wirklich ändern, Person-
// Feld wirklich überschreiben, Duplikate wirklich mergen) kommt in
// Phase B als lib/suggestion-apply.ts. Bis dahin ist "akzeptiert"
// effektiv ein Bookmark, kein State-Change auf der Ziel-Tabelle.
//
// Optimistic-UI auf dem Client: revalidatePath nach jedem Status-Change
// damit der Suggestion-Stack frisch geladen wird, aber die Card
// verschwindet schon vorher dank useTransition-Render.

import { revalidatePath } from "next/cache";
import {
  accept as acceptSuggestion,
  reject as rejectSuggestion,
  dismiss as dismissSuggestion,
} from "@/lib/suggestions";

export async function acceptSuggestionAction(
  suggestionId: string,
  personId: string,
): Promise<{ ok: boolean }> {
  const ok = await acceptSuggestion(suggestionId);
  revalidatePath(`/people/${personId}`);
  return { ok };
}

export async function rejectSuggestionAction(
  suggestionId: string,
  personId: string,
): Promise<{ ok: boolean }> {
  const ok = await rejectSuggestion(suggestionId);
  revalidatePath(`/people/${personId}`);
  return { ok };
}

export async function dismissSuggestionAction(
  suggestionId: string,
  personId: string,
): Promise<{ ok: boolean }> {
  const ok = await dismissSuggestion(suggestionId);
  revalidatePath(`/people/${personId}`);
  return { ok };
}
