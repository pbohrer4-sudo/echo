// Minimal-i18n für Echo. Ein flaches Dict pro Sprache mit deutschen
// Keys (Deutsch ist Default + Fallback). Englisch wird inkrementell
// ausgebaut — alles was hier nicht übersetzt ist, fällt auf den
// deutschen Originaltext zurück.
//
// V3-Anker-Begriffe (Signals/Interests/Potential/Origin/Passions/
// Circles, sowie Tag/Mode/Purpose/Depth) bleiben bewusst in jeder
// Sprache identisch (Englisch) — diese Konstanten werden über
// lib/types.ts ausgegeben und tauchen hier nicht auf.

export type Locale = "de" | "en";

export const DEFAULT_LOCALE: Locale = "de";

// Dict-Shape: key → { de: string, en: string }
// Keys sind explizit kurz + bedeutungstragend, nicht hierarchisch
// damit man sie schnell findet (kein nested-namespace-overhead).
export const DICT = {
  // ─── Navigation ───
  "nav.heute": { de: "Heute", en: "Today" },
  "nav.voice": { de: "Voice", en: "Voice" },
  "nav.wecker": { de: "Wecker", en: "Alarm" },
  "nav.people": { de: "Personen", en: "People" },
  "nav.organizations": { de: "Organisationen", en: "Organizations" },
  "nav.reminders": { de: "Reminders", en: "Reminders" },
  "nav.rhythm": { de: "Rhythmus", en: "Rhythm" },
  "nav.lifeline": { de: "Lifeline", en: "Lifeline" },
  "nav.pulse": { de: "Sonntags-Puls", en: "Sunday Pulse" },
  "nav.recap": { de: "Rückblick", en: "Recap" },
  "nav.integrations": { de: "Voice Vibe Integrations", en: "Voice Vibe Integrations" },
  "nav.connections": { de: "Verbindungen", en: "Connections" },
  "nav.workflows": { de: "Workflows", en: "Workflows" },
  "nav.models": { de: "Modelle", en: "Models" },

  // ─── Generic actions ───
  "action.save": { de: "Speichern", en: "Save" },
  "action.cancel": { de: "Abbrechen", en: "Cancel" },
  "action.delete": { de: "Löschen", en: "Delete" },
  "action.edit": { de: "Bearbeiten", en: "Edit" },
  "action.back": { de: "Zurück", en: "Back" },
  "action.create": { de: "Anlegen", en: "Create" },
  "action.next": { de: "Weiter", en: "Next" },
  "action.skip": { de: "Überspringen", en: "Skip" },
  "action.add": { de: "Hinzufügen", en: "Add" },
  "action.search": { de: "Suche", en: "Search" },
  "action.continue": { de: "Los geht's", en: "Let's go" },

  // ─── Common labels ───
  "label.name": { de: "Name", en: "Name" },
  "label.company": { de: "Firma", en: "Company" },
  "label.role": { de: "Rolle", en: "Role" },
  "label.notes": { de: "Notizen", en: "Notes" },
  "label.birthday": { de: "Geburtstag", en: "Birthday" },
  "label.phone": { de: "Telefon", en: "Phone" },
  "label.email": { de: "Email", en: "Email" },
  "label.address": { de: "Adresse", en: "Address" },
  "label.location": { de: "Ort", en: "Location" },
  "label.date": { de: "Datum", en: "Date" },
  "label.optional": { de: "optional", en: "optional" },
  "label.required": { de: "Pflicht", en: "Required" },
  "label.timezone": { de: "Zeitzone", en: "Timezone" },
  "label.language": { de: "Sprache", en: "Language" },

  // ─── 3-Achsen Person ───
  "axis.depth": { de: "Tiefe", en: "Depth" },
  "axis.purpose": { de: "Zweck", en: "Purpose" },
  "axis.mode": { de: "Modus", en: "Mode" },
  "axis.cadence": { de: "Cadence", en: "Cadence" },

  // ─── Depth values ───
  "depth.inner_5": { de: "Innerer Kreis", en: "Inner Circle" },
  "depth.trusted_15": { de: "Vertrauter Kreis", en: "Trusted Circle" },
  "depth.active_50": { de: "Aktiver Kreis", en: "Active Circle" },
  "depth.network_150": { de: "Netzwerk", en: "Network" },
  "depth.periphery_500": { de: "Peripherie", en: "Periphery" },

  // ─── Purpose values ───
  "purpose.personal": { de: "Privat", en: "Personal" },
  "purpose.family": { de: "Familie", en: "Family" },
  "purpose.business_active": { de: "Business aktiv", en: "Business active" },
  "purpose.business_latent": { de: "Business latent", en: "Business latent" },
  "purpose.aspirational": { de: "Aufbau", en: "Aspirational" },

  // ─── Mode values ───
  "mode.active": { de: "Aktiv", en: "Active" },
  "mode.nurture": { de: "Pflege", en: "Nurture" },
  "mode.dormant": { de: "Ruhend", en: "Dormant" },
  "mode.reconnect": { de: "Wiederbeleben", en: "Reconnect" },
  "mode.archive": { de: "Archiviert", en: "Archive" },

  // ─── Person-Detail Section-Header ───
  "section.important_dates": { de: "Wichtige Daten", en: "Key Dates" },
  "section.relationships": { de: "Beziehungen", en: "Relationships" },
  "section.reminders": { de: "Erinnerungen", en: "Reminders" },
  "section.todos": { de: "Aufgaben", en: "Tasks" },
  "section.timeline": { de: "Timeline", en: "Timeline" },
  "section.contacts": { de: "Kontakte", en: "Contacts" },
  "section.places": { de: "Orte", en: "Places" },
  "section.life_events": { de: "Life Events", en: "Life Events" },
  "section.weitere_kanaele": { de: "Weitere Kanäle", en: "More Channels" },
  "section.ki_draft": { de: "KI-Entwurf für WhatsApp", en: "AI WhatsApp Draft" },

  // ─── Heute-Dashboard ───
  "today.greeting_morning": { de: "Guten Morgen", en: "Good morning" },
  "today.greeting_day": { de: "Guten Tag", en: "Good day" },
  "today.greeting_evening": { de: "Guten Abend", en: "Good evening" },
  "today.empty": {
    de: "Nichts dringend.",
    en: "Nothing urgent.",
  },
  "today.has_attention": {
    de: "Das hier braucht heute deine Aufmerksamkeit.",
    en: "This needs your attention today.",
  },

  // ─── People-Liste ───
  "people.title": { de: "Personen", en: "People" },
  "people.subtitle": {
    de: "Beruflich und privat. Sortier-, filter- und durchsuchbar.",
    en: "Professional and personal. Sortable, filterable, searchable.",
  },
  "people.new_person": { de: "+ Person", en: "+ Person" },
  "people.search_placeholder": {
    de: "Name, Firma, Ort, Notiz …",
    en: "Name, company, city, note …",
  },

  // ─── Quick-Add / Edit ───
  "form.how_we_met": {
    de: "Wie wir uns kennengelernt haben",
    en: "How we met",
  },
  "form.how_we_met.hint": {
    de: "Optional. 1-3 Sätze: Ort, Anlass, gemeinsame Bekannte.",
    en: "Optional. 1-3 sentences: place, occasion, mutuals.",
  },
  "form.current_location": { de: "Aktueller Wohnort", en: "Current location" },
  "form.home_location": { de: "Heimat / Herkunft", en: "Home / Origin" },
  "form.met_date": { de: "Datum des Treffens", en: "Date of meeting" },
  "form.met_location": { de: "Ort des Treffens", en: "Place of meeting" },
} as const;

export type TranslationKey = keyof typeof DICT;

// Hauptfunktion: Key + Sprache → übersetzter String.
// Unbekannter Key → der Key selbst (sichtbar als Hinweis im UI).
// Fehlende Übersetzung → fällt auf Deutsch zurück.
export function t(key: TranslationKey | string, locale: Locale = DEFAULT_LOCALE): string {
  const entry = (DICT as Record<string, { de: string; en: string }>)[key];
  if (!entry) return key;
  return entry[locale] ?? entry.de;
}
