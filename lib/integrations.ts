// Static catalog of integrations. Backend wiring for "planned" entries
// comes later — this file is the single source of truth for the
// orchestrator visualization and the per-integration detail view.

export type IntegrationDirection = "inbound" | "outbound" | "both";
export type IntegrationStatus = "connected" | "available" | "planned";

export interface Workflow {
  trigger: string;
  action: string;
  enabled?: boolean;
}

export interface FieldMapping {
  ours: string;
  theirs: string;
  direction?: "in" | "out" | "both";
  note?: string;
}

export interface Integration {
  id: string;
  name: string;
  vendor: string;
  glyph: string;
  direction: IntegrationDirection;
  status: IntegrationStatus;
  description: string;
  workflows: Workflow[];
  fieldMappings: FieldMapping[];
  authNote?: string;
}

export const INTEGRATIONS: Integration[] = [
  {
    id: "voice",
    name: "Voice Capture",
    vendor: "ECHO Native",
    glyph: "VC",
    direction: "inbound",
    status: "connected",
    description:
      "Browser Speech-Recognition → Claude Tool-Use → strukturierte CRM-Daten. Live in Voice + Debrief.",
    workflows: [
      {
        trigger: "Du sprichst über eine bekannte Person",
        action: "update_person (add_tags, add_phones, etc.)",
        enabled: true,
      },
      {
        trigger: "Du sprichst über jemanden Neues",
        action: "create_person mit allen mitgegebenen Feldern",
        enabled: true,
      },
      {
        trigger: "Du sprichst über ein Treffen / Anruf / Email",
        action: "log_interaction mit person_ids + summary + sentiment",
        enabled: true,
      },
      {
        trigger: "Du formulierst ein Versprechen oder Geburtstag",
        action: "create_reminder mit recurrence",
        enabled: true,
      },
    ],
    fieldMappings: [
      {
        ours: "person.tags / phones / emails / …",
        theirs: "freier Sprachinput",
        direction: "in",
        note: "Claude Tool-Use mappt selbst, du bestätigst pro Karte.",
      },
    ],
  },
  {
    id: "business-card",
    name: "Visitenkarten-Scan",
    vendor: "Claude Vision",
    glyph: "VK",
    direction: "inbound",
    status: "connected",
    description:
      "Foto einer Karte → claude-sonnet-4-6 mit forced tool-use → Felder vorausgefüllt im PersonForm.",
    workflows: [
      {
        trigger: "Foto-Upload auf /people/new",
        action: "extract_business_card → prefill PersonForm",
        enabled: true,
      },
    ],
    fieldMappings: [
      { ours: "name", theirs: "Name auf der Karte", direction: "in" },
      { ours: "company", theirs: "Firmenname", direction: "in" },
      { ours: "role", theirs: "Position / Titel", direction: "in" },
      { ours: "phones[]", theirs: "Tel-Nummern (mit Label)", direction: "in" },
      { ours: "emails[]", theirs: "Email-Adressen", direction: "in" },
      { ours: "addresses[]", theirs: "Adresse", direction: "in" },
      { ours: "socials[]", theirs: "LinkedIn / Twitter / Website", direction: "in" },
    ],
  },
  {
    id: "auto-enrich",
    name: "Org Auto-Enrich",
    vendor: "Claude",
    glyph: "AE",
    direction: "inbound",
    status: "connected",
    description:
      "Claude-Trainingswissen reichert Branche, HQ, Größe, Beschreibung an — manuelle Bestätigung pro Feld.",
    workflows: [
      {
        trigger: "Auto-Enrich-Klick auf Org-Form",
        action: "enrich_organization → leere Felder ausfüllen",
        enabled: true,
      },
    ],
    fieldMappings: [
      { ours: "organization.industry", theirs: "Claude knowledge", direction: "in" },
      { ours: "organization.website / domain", theirs: "Claude knowledge", direction: "in" },
      { ours: "organization.size", theirs: "Claude knowledge", direction: "in" },
      { ours: "organization.hq", theirs: "Claude knowledge", direction: "in" },
      { ours: "organization.description", theirs: "Claude knowledge", direction: "in" },
      { ours: "organization.tags", theirs: "Claude knowledge", direction: "in" },
    ],
  },
  {
    id: "vcard",
    name: "vCard Import",
    vendor: "iPhone Contacts / Standard",
    glyph: "VC",
    direction: "inbound",
    status: "planned",
    description:
      "Bulk-Import aus .vcf-Dateien — wie sie iPhone Contacts und Apple Mail erzeugen.",
    workflows: [
      {
        trigger: "Upload .vcf",
        action: "Bulk create_person mit Match-Confirmation pro Eintrag",
      },
    ],
    fieldMappings: [
      { ours: "name", theirs: "FN / N", direction: "in" },
      { ours: "phones[]", theirs: "TEL", direction: "in" },
      { ours: "emails[]", theirs: "EMAIL", direction: "in" },
      { ours: "addresses[]", theirs: "ADR", direction: "in" },
      { ours: "important_dates[]", theirs: "BDAY / ANNIVERSARY", direction: "in" },
      { ours: "company", theirs: "ORG", direction: "in" },
      { ours: "role", theirs: "TITLE", direction: "in" },
      { ours: "socials[]", theirs: "URL / X-SOCIALPROFILE", direction: "in" },
    ],
    authNote: "Kein Auth — lokaler Datei-Upload.",
  },
  {
    id: "apple-calendar",
    name: "Apple Calendar",
    vendor: "Apple",
    glyph: "iC",
    direction: "both",
    status: "planned",
    description:
      "Termine als Interaktionen importieren; Geburtstage und Erinnerungen als Events publizieren.",
    workflows: [
      {
        trigger: "Neuer Termin im Kalender",
        action: "Vorschlag log_interaction (Confirm pro Eintrag)",
      },
      {
        trigger: "important_date mit remind=true",
        action: "VEVENT mit RRULE=YEARLY in einen ECHO-Kalender",
      },
    ],
    fieldMappings: [
      {
        ours: "interaction.occurred_at",
        theirs: "event.start",
        direction: "in",
      },
      { ours: "interaction.summary", theirs: "event.title", direction: "in" },
      {
        ours: "person.name (fuzzy match)",
        theirs: "event.attendees[].name",
        direction: "in",
      },
      {
        ours: "important_dates[].date + label",
        theirs: "event.start + event.title",
        direction: "out",
      },
    ],
    authNote: "EventKit / OAuth über CalDAV. iOS-only ohne Brücke.",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    vendor: "Google",
    glyph: "GC",
    direction: "both",
    status: "planned",
    description: "Bidirektionaler Sync via Google Calendar API.",
    workflows: [
      {
        trigger: "Webhook von Google bei Termin-Update",
        action: "Vorschlag log_interaction",
      },
      {
        trigger: "important_date angelegt / aktualisiert",
        action: "Event in ECHO-Kalender pushen",
      },
    ],
    fieldMappings: [
      { ours: "interaction.summary", theirs: "Event.summary", direction: "in" },
      {
        ours: "interaction.occurred_at",
        theirs: "Event.start.dateTime",
        direction: "in",
      },
      {
        ours: "person.email (Match)",
        theirs: "Event.attendees[].email",
        direction: "in",
      },
    ],
    authNote: "OAuth 2.0 mit calendar.events scope.",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    vendor: "LinkedIn",
    glyph: "Li",
    direction: "inbound",
    status: "planned",
    description:
      "Connections + Profil-Updates importieren. Erste Version via CSV-Export, später API.",
    workflows: [
      {
        trigger: "CSV-Upload (LinkedIn-Export)",
        action: "Bulk create_person mit Social=LinkedIn",
      },
      {
        trigger: "Profile gefolgt",
        action: "create_person mit Tags + Notiz",
      },
    ],
    fieldMappings: [
      { ours: "name", theirs: "First Name + Last Name", direction: "in" },
      { ours: "company", theirs: "Company", direction: "in" },
      { ours: "role", theirs: "Position", direction: "in" },
      {
        ours: "socials[]",
        theirs: "LinkedIn URL",
        direction: "in",
      },
      { ours: "emails[]", theirs: "Email Address", direction: "in" },
    ],
  },
  {
    id: "mail-signature",
    name: "Mail Signatur-Parser",
    vendor: "IMAP / Gmail / Forward",
    glyph: "✉",
    direction: "inbound",
    status: "planned",
    description:
      "Eingehende Emails an inbox@echo.you weiterleiten — Signatur wird extrahiert und vorgeschlagen.",
    workflows: [
      {
        trigger: "Email an inbox-Adresse",
        action: "Claude extrahiert Signatur → create_person Vorschlag",
      },
    ],
    fieldMappings: [
      { ours: "name", theirs: "From-Header / Signatur", direction: "in" },
      { ours: "emails[]", theirs: "From-Adresse", direction: "in" },
      { ours: "phones[]", theirs: "Signatur-Footer", direction: "in" },
      { ours: "company", theirs: "Domain / Signatur", direction: "in" },
    ],
  },
  {
    id: "ics-export",
    name: "ICS Calendar Feed",
    vendor: "iCalendar Standard",
    glyph: "📆",
    direction: "outbound",
    status: "connected",
    description:
      "Pro Person ein .ics-Feed mit allen wichtigen Daten als VEVENT, abonnierbar in jedem Kalender.",
    workflows: [
      {
        trigger: "GET /api/people/[id]/dates.ics",
        action: "Stream VEVENTs mit RRULE=YEARLY",
        enabled: true,
      },
    ],
    fieldMappings: [
      { ours: "important_dates[].date", theirs: "DTSTART", direction: "out" },
      {
        ours: "important_dates[].label + person.name",
        theirs: "SUMMARY",
        direction: "out",
      },
    ],
  },
  {
    id: "hubspot",
    name: "HubSpot CRM",
    vendor: "HubSpot",
    glyph: "Hs",
    direction: "both",
    status: "planned",
    description:
      "Bidirektionaler Kontakt-Sync — Patrick's Sales-Pipelines bleiben in HubSpot, Beziehungs-Kontext in ECHO.",
    workflows: [
      {
        trigger: "Person mit scope=work erstellt",
        action: "Push als HubSpot Contact",
      },
      {
        trigger: "HubSpot Contact-Property geändert",
        action: "Webhook → update_person",
      },
      {
        trigger: "log_interaction für work-Person",
        action: "Engagement (Note/Call/Meeting) in HubSpot",
      },
    ],
    fieldMappings: [
      { ours: "person.name", theirs: "firstname + lastname", direction: "both" },
      { ours: "person.company", theirs: "company", direction: "both" },
      { ours: "person.role", theirs: "jobtitle", direction: "both" },
      { ours: "person.emails[0]", theirs: "email", direction: "both" },
      { ours: "person.phones[0]", theirs: "phone", direction: "both" },
      { ours: "person.tags", theirs: "lifecyclestage / contact list memberships", direction: "both" },
      {
        ours: "interaction (meeting/call)",
        theirs: "Engagements API",
        direction: "out",
      },
    ],
    authNote: "OAuth 2.0 mit Private App Token alternativ.",
  },
  {
    id: "notion",
    name: "Notion",
    vendor: "Notion",
    glyph: "No",
    direction: "outbound",
    status: "planned",
    description:
      "Personen + Organisationen als Notion-DB-Einträge exportieren — für Team-Sichten oder Archiv.",
    workflows: [
      {
        trigger: "Nach-Notion-exportieren pro Person",
        action: "Page mit Properties in konfigurierter Notion-Database",
      },
      {
        trigger: "Manueller Bulk-Export",
        action: "Alle Personen → Pages",
      },
    ],
    fieldMappings: [
      { ours: "person.name", theirs: "Title", direction: "out" },
      { ours: "person.tags", theirs: "Multi-select", direction: "out" },
      { ours: "person.notes", theirs: "Page body", direction: "out" },
      { ours: "person.organization", theirs: "Relation → Companies DB", direction: "out" },
    ],
    authNote: "Notion API Internal Integration Token.",
  },
  {
    id: "webhooks",
    name: "Webhooks",
    vendor: "Custom",
    glyph: "wH",
    direction: "outbound",
    status: "planned",
    description:
      "Bei Events POST an deine URLs (Zapier, n8n, Make, eigene Endpoints).",
    workflows: [
      { trigger: "person.created", action: "POST → konfigurierte URL" },
      { trigger: "interaction.logged", action: "POST → konfigurierte URL" },
      { trigger: "reminder.due", action: "POST → konfigurierte URL" },
      { trigger: "debrief.completed", action: "POST → konfigurierte URL" },
    ],
    fieldMappings: [
      {
        ours: "Vollständiges Event-Payload",
        theirs: "JSON Body",
        direction: "out",
      },
    ],
    authNote: "HMAC-Signature im Header X-ECHO-Signature.",
  },
];

export function integrationsByDirection(d: "inbound" | "outbound") {
  if (d === "inbound") {
    return INTEGRATIONS.filter(
      (i) => i.direction === "inbound" || i.direction === "both",
    );
  }
  return INTEGRATIONS.filter(
    (i) => i.direction === "outbound" || i.direction === "both",
  );
}
