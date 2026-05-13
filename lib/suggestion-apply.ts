// Per-Type-Apply-Logik für Suggestions (Phase B1).
//
// Wird von acceptSuggestionAction aufgerufen wenn User "Übernehmen"
// klickt. Schreibt die eigentliche Änderung auf die Ziel-Tabelle.
//
// Designprinzip: jede Apply-Funktion ist defensiv — wenn der Payload
// nicht zum Schema passt, return { ok: false, error: ... } statt
// zu werfen. Der Caller (acceptSuggestionAction) entscheidet dann
// ob Status auf 'accepted' gesetzt oder bei 'pending' belassen wird.
//
// 6 Types haben echte Apply-Logik. Komplexere Types (merge_duplicate,
// connection) sind bewusst auf "not_yet_implemented" — die kommen
// wenn Phase D die zugehörigen AI-Pipelines liefert und wir die
// echte Payload-Form sehen.

import { createClient } from "@/lib/supabase/server";
import type {
  Depth,
  Mode,
  Purpose,
  SuggestionRow,
  TagCluster,
} from "@/lib/types";

export interface ApplyResult {
  ok: boolean;
  error?: string;
  reason?: "invalid_payload" | "db_error" | "not_yet_implemented";
}

const DEPTH_VALUES: Depth[] = [
  "inner_5",
  "trusted_15",
  "active_50",
  "network_150",
  "periphery_500",
];
const MODE_VALUES: Mode[] = [
  "active",
  "nurture",
  "dormant",
  "reconnect",
  "archive",
];
const PURPOSE_VALUES: Purpose[] = [
  "personal",
  "family",
  "business_active",
  "business_latent",
  "aspirational",
];
const CLUSTER_VALUES: TagCluster[] = ["reminders", "interests", "potential", "origin"];

export async function applySuggestion(
  suggestion: SuggestionRow,
): Promise<ApplyResult> {
  switch (suggestion.suggestion_type) {
    case "tag":
      return applyTag(suggestion);
    case "depth_change":
      return applyDepthChange(suggestion);
    case "mode_change":
      return applyModeChange(suggestion);
    case "purpose_mapping":
      return applyPurposeMapping(suggestion);
    case "how_we_met_extract":
      return applyHowWeMet(suggestion);
    case "field_enrichment":
      return applyFieldEnrichment(suggestion);
    // Folgende kommen mit Phase D wenn die AI-Pipelines Payloads
    // produzieren — bis dahin sicherer Stub.
    case "merge_duplicate":
    case "cta":
    case "cadence":
    case "connection":
    case "reconnect":
      return {
        ok: false,
        reason: "not_yet_implemented",
        error: `Apply für '${suggestion.suggestion_type}' ist noch nicht implementiert`,
      };
    default:
      return {
        ok: false,
        reason: "invalid_payload",
        error: `Unbekannter suggestion_type: ${suggestion.suggestion_type}`,
      };
  }
}

// ----------------------------------------------------------------------
// tag — Cluster-Reklassifizierung
// payload: { tag_id, proposed_cluster, current_cluster? }
// ----------------------------------------------------------------------
async function applyTag(s: SuggestionRow): Promise<ApplyResult> {
  const tagId = stringField(s.payload, "tag_id");
  const newClusterRaw = stringField(s.payload, "proposed_cluster");
  if (!tagId || !newClusterRaw) {
    return invalid("tag-Suggestion braucht tag_id + proposed_cluster");
  }
  if (!CLUSTER_VALUES.includes(newClusterRaw as TagCluster)) {
    return invalid(`unbekannter Cluster: ${newClusterRaw}`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .update({
      cluster: newClusterRaw as TagCluster,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tagId);
  if (error) return dbError(error.message);
  return { ok: true };
}

// ----------------------------------------------------------------------
// depth_change
// payload: { proposed_depth, current_depth? }
// Setzt depth_source='auto' weil die AI's Berechnung übernommen wird —
// nicht manual_override. Cron darf weiter rechnen.
// ----------------------------------------------------------------------
async function applyDepthChange(s: SuggestionRow): Promise<ApplyResult> {
  const newDepth = stringField(s.payload, "proposed_depth");
  if (!newDepth) return invalid("depth_change braucht proposed_depth");
  if (!DEPTH_VALUES.includes(newDepth as Depth)) {
    return invalid(`unbekannter depth-Wert: ${newDepth}`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ depth: newDepth as Depth, depth_source: "auto" })
    .eq("id", s.person_id);
  if (error) return dbError(error.message);
  return { ok: true };
}

// ----------------------------------------------------------------------
// mode_change
// payload: { proposed_mode }
// ----------------------------------------------------------------------
async function applyModeChange(s: SuggestionRow): Promise<ApplyResult> {
  const newMode = stringField(s.payload, "proposed_mode");
  if (!newMode) return invalid("mode_change braucht proposed_mode");
  if (!MODE_VALUES.includes(newMode as Mode)) {
    return invalid(`unbekannter mode-Wert: ${newMode}`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ mode: newMode as Mode })
    .eq("id", s.person_id);
  if (error) return dbError(error.message);
  return { ok: true };
}

// ----------------------------------------------------------------------
// purpose_mapping
// payload: { proposed_purpose }
// ----------------------------------------------------------------------
async function applyPurposeMapping(s: SuggestionRow): Promise<ApplyResult> {
  const newPurpose = stringField(s.payload, "proposed_purpose");
  if (!newPurpose) return invalid("purpose_mapping braucht proposed_purpose");
  if (!PURPOSE_VALUES.includes(newPurpose as Purpose)) {
    return invalid(`unbekannter purpose-Wert: ${newPurpose}`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ purpose: newPurpose as Purpose })
    .eq("id", s.person_id);
  if (error) return dbError(error.message);
  return { ok: true };
}

// ----------------------------------------------------------------------
// how_we_met_extract
// payload: { how_we_met, met_date?, met_location?, met_event? }
// Schreibt alle vier Met-Felder die im Payload da sind, lässt Rest unverändert.
// ----------------------------------------------------------------------
async function applyHowWeMet(s: SuggestionRow): Promise<ApplyResult> {
  const howWeMet = stringField(s.payload, "how_we_met");
  if (!howWeMet) return invalid("how_we_met_extract braucht how_we_met");
  const update: Record<string, string> = { how_we_met: howWeMet };
  const metDate = stringField(s.payload, "met_date");
  if (metDate && /^\d{4}-\d{2}-\d{2}$/.test(metDate)) {
    update.met_date = metDate;
  }
  const metLocation = stringField(s.payload, "met_location");
  if (metLocation) update.met_location = metLocation;
  const metEvent = stringField(s.payload, "met_event");
  if (metEvent) update.met_event = metEvent;
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update(update)
    .eq("id", s.person_id);
  if (error) return dbError(error.message);
  return { ok: true };
}

// ----------------------------------------------------------------------
// field_enrichment — generisches Single-Field-Update auf people.
// Whitelisted Felder damit nicht beliebige Spalten überschreibbar sind.
// payload: { field, value }
// ----------------------------------------------------------------------
const ENRICHABLE_FIELDS = new Set<string>([
  "first_name",
  "last_name",
  "company",
  "role",
  "linkedin_url",
  "photo_url",
  "current_location",
  "home_location",
  "met_location",
  "met_event",
  "cadence_days",
]);

async function applyFieldEnrichment(s: SuggestionRow): Promise<ApplyResult> {
  const field = stringField(s.payload, "field");
  if (!field) return invalid("field_enrichment braucht field");
  if (!ENRICHABLE_FIELDS.has(field)) {
    return invalid(`Feld '${field}' nicht enrichable`);
  }
  const value = s.payload.value ?? s.payload.new_value;
  if (value === undefined) return invalid("field_enrichment braucht value");
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ [field]: value })
    .eq("id", s.person_id);
  if (error) return dbError(error.message);
  return { ok: true };
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function stringField(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const v = payload[key];
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function invalid(message: string): ApplyResult {
  return { ok: false, reason: "invalid_payload", error: message };
}

function dbError(message: string): ApplyResult {
  return { ok: false, reason: "db_error", error: message };
}
