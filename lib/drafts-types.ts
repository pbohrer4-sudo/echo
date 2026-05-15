// Client-safe Constants + Types fuer Drafts. Separat von lib/drafts.ts
// damit die Client-Component diese importieren kann ohne den Server-
// only Code (supabase/server, claude.ts etc.) mitzubringen.

export type DraftUseCase =
  | "reengage"
  | "business"
  | "birthday"
  | "intro_thanks"
  | "follow_up"
  | "lebenszeichen"
  | "missing_data";

export const DRAFT_USE_CASE_LABELS: Record<DraftUseCase, string> = {
  reengage: "Reengage Freund",
  business: "Business Meeting",
  birthday: "Geburtstag",
  intro_thanks: "Danke für Intro",
  follow_up: "Follow-Up",
  lebenszeichen: "Lebenszeichen",
  missing_data: "Fehlende Daten",
};

export const DRAFT_USE_CASE_DESCRIPTIONS: Record<DraftUseCase, string> = {
  reengage: "Warmherziger Reach-Out für einen alten Freund",
  business: "Direkter, respektvoller Business-Termin-Vorschlag",
  birthday: "Persönliche Geburtstags-Nachricht",
  intro_thanks: "Kurzer Dank nach einem Intro",
  follow_up: "Action-orientiertes Follow-Up nach Treffen",
  lebenszeichen: "Behutsames Lebenszeichen, kein konkretes Anliegen",
  missing_data: "Proaktiv nach fehlenden Daten fragen (Adresse, Geburtstag …)",
};
