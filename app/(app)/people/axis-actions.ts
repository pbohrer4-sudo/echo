"use server";

// Server Actions für die 3-Achsen-Klassifizierung (Phase C1).
// Patrick klickt auf der Person-Detail-Page einen der drei Badges,
// wählt einen neuen Wert — diese Actions schreiben den Wert direkt
// auf die people-Zeile. KEIN Suggestion-Flow hier: das ist eine
// explizite manuelle User-Entscheidung, kein AI-Vorschlag.
//
// Für `depth` setzen wir gleichzeitig `depth_source = 'manual_override'`,
// damit der wöchentliche Auto-Calc-Cron (Phase D3) den manuellen
// Wert nicht überschreibt. Wer auf "auto" zurück will, klickt explizit.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Depth, Mode, Purpose } from "@/lib/types";

const DEPTH_VALUES: Depth[] = [
  "inner_5",
  "trusted_15",
  "active_50",
  "network_150",
  "periphery_500",
];

const PURPOSE_VALUES: Purpose[] = [
  "personal",
  "family",
  "business_active",
  "business_latent",
  "aspirational",
];

const MODE_VALUES: Mode[] = [
  "active",
  "nurture",
  "dormant",
  "reconnect",
  "archive",
];

/**
 * Setzt `depth` und `depth_source='manual_override'`. NULL als value
 * setzt depth=null + depth_source='auto' zurück, sodass der Cron
 * wieder berechnet.
 */
export async function updatePersonDepth(
  personId: string,
  depth: Depth | null,
): Promise<{ ok: boolean; error?: string }> {
  if (depth !== null && !DEPTH_VALUES.includes(depth)) {
    return { ok: false, error: "invalid depth value" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({
      depth,
      depth_source: depth === null ? "auto" : "manual_override",
    })
    .eq("id", personId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

export async function updatePersonPurpose(
  personId: string,
  purpose: Purpose | null,
): Promise<{ ok: boolean; error?: string }> {
  if (purpose !== null && !PURPOSE_VALUES.includes(purpose)) {
    return { ok: false, error: "invalid purpose value" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ purpose })
    .eq("id", personId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

/**
 * Setzt `mode`. Achtung: der Mode-Cron (Phase D3) kann manuelle
 * Werte überschreiben — z.B. active → dormant nach 2× cadence ohne
 * Interaktion. Eine echte Manual-Override-Sperre kommt mit einem
 * `mode_source`-Feld in einer späteren Phase. Bis dahin ist mode-
 * Editing eher ein Soft-Override.
 */
export async function updatePersonMode(
  personId: string,
  mode: Mode,
): Promise<{ ok: boolean; error?: string }> {
  if (!MODE_VALUES.includes(mode)) {
    return { ok: false, error: "invalid mode value" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ mode })
    .eq("id", personId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

/**
 * Manueller Reset: depth_source='auto', depth wird beim nächsten Cron
 * neu berechnet. NULLt das depth-Feld erstmal, sodass UI klar zeigt
 * "wird berechnet".
 */
export async function resetDepthToAuto(
  personId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ depth: null, depth_source: "auto" })
    .eq("id", personId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/people/${personId}`);
  return { ok: true };
}
