import type { WorkflowNodeKind } from "@/lib/types";

export interface NodeTemplate {
  subtype: string;
  kind: WorkflowNodeKind;
  label: string;
  description: string;
  // Output fields downstream nodes can map from. For triggers, these
  // describe the event payload. For filters/transforms, these are
  // pass-through (mirror what the upstream provides).
  outputFields: string[];
  // Inputs the node expects in its config.
  configFields: ConfigField[];
}

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "textarea";
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

export const NODE_CATALOG: NodeTemplate[] = [
  // ======== TRIGGERS ========
  {
    subtype: "trigger.voice_extraction",
    kind: "trigger",
    label: "Voice Extraction",
    description: "Feuert nach jeder bestätigten Voice-Extraction.",
    outputFields: [
      "person.id",
      "person.name",
      "person.scope",
      "person.tags",
      "tool_calls",
    ],
    configFields: [],
  },
  {
    subtype: "trigger.person_created",
    kind: "trigger",
    label: "Person erstellt",
    description: "Bei jeder neu angelegten Person.",
    outputFields: ["person.id", "person.name", "person.company", "person.scope"],
    configFields: [],
  },
  {
    subtype: "trigger.person_updated",
    kind: "trigger",
    label: "Person aktualisiert",
    description: "Bei jeder Person-Änderung. Optional gefiltert auf Felder.",
    outputFields: ["person.id", "person.name", "changed_fields"],
    configFields: [
      {
        key: "watch_fields",
        label: "Felder beobachten (komma)",
        type: "text",
        placeholder: "company, role, tags",
      },
    ],
  },
  {
    subtype: "trigger.interaction_logged",
    kind: "trigger",
    label: "Interaktion geloggt",
    description: "Treffen, Anruf, Email oder Voice-Note in interactions.",
    outputFields: [
      "interaction.id",
      "interaction.type",
      "interaction.summary",
      "interaction.sentiment",
      "person_ids",
    ],
    configFields: [],
  },
  {
    subtype: "trigger.reminder_due",
    kind: "trigger",
    label: "Reminder fällig",
    description: "Wenn ein Reminder seinen remind_at erreicht.",
    outputFields: ["reminder.id", "reminder.text", "person.id"],
    configFields: [],
  },
  {
    subtype: "trigger.cron",
    kind: "trigger",
    label: "Zeitplan",
    description: "Cron-Schedule, läuft in V2 via Vercel Cron.",
    outputFields: ["fired_at"],
    configFields: [
      {
        key: "schedule",
        label: "Cron-Expression",
        type: "text",
        placeholder: "0 9 * * MON",
        required: true,
      },
    ],
  },
  {
    subtype: "trigger.webhook",
    kind: "trigger",
    label: "Webhook",
    description: "POST auf eine eindeutige URL. URL wird beim Speichern erzeugt.",
    outputFields: ["body", "headers"],
    configFields: [
      {
        key: "secret",
        label: "Shared Secret (HMAC)",
        type: "text",
        placeholder: "optional",
      },
    ],
  },

  // ======== FILTERS ========
  {
    subtype: "filter.scope",
    kind: "filter",
    label: "Scope-Filter",
    description: "Lässt Events nur durch wenn die Person den gewählten Scope hat.",
    outputFields: [],
    configFields: [
      {
        key: "scope",
        label: "Scope",
        type: "select",
        options: ["work", "personal", "both"],
        required: true,
      },
    ],
  },
  {
    subtype: "filter.has_tag",
    kind: "filter",
    label: "Tag-Filter",
    description: "Person muss einen der genannten Tags tragen.",
    outputFields: [],
    configFields: [
      {
        key: "tags",
        label: "Tags (komma)",
        type: "text",
        placeholder: "Tennis, Kunde",
        required: true,
      },
    ],
  },
  {
    subtype: "filter.strength_min",
    kind: "filter",
    label: "Mindest-Stärke",
    description: "Beziehungsstärke muss mindestens X sein (1-5).",
    outputFields: [],
    configFields: [
      {
        key: "min",
        label: "Min (1-5)",
        type: "number",
        placeholder: "3",
        required: true,
      },
    ],
  },
  {
    subtype: "filter.sentiment",
    kind: "filter",
    label: "Sentiment-Filter",
    description: "Lässt nur die gewählten Sentiments durch.",
    outputFields: [],
    configFields: [
      {
        key: "allow",
        label: "Erlaubt",
        type: "select",
        options: ["positive", "neutral", "tense", "any"],
        required: true,
      },
    ],
  },

  // ======== TRANSFORMS ========
  {
    subtype: "transform.format_date",
    kind: "transform",
    label: "Datum formatieren",
    description: "ISO → menschenlesbar, z.B. 14. März 2026.",
    outputFields: ["formatted_date"],
    configFields: [
      {
        key: "input_field",
        label: "Eingabefeld",
        type: "text",
        placeholder: "person.last_interaction_at",
        required: true,
      },
      {
        key: "format",
        label: "Format",
        type: "select",
        options: ["lang", "kurz", "mono"],
      },
    ],
  },
  {
    subtype: "transform.template",
    kind: "transform",
    label: "Text-Template",
    description: "String mit {{platzhalter}}-Substitution.",
    outputFields: ["text"],
    configFields: [
      {
        key: "template",
        label: "Template",
        type: "textarea",
        placeholder: "Hallo {{person.name}}, du hast {{tags.length}} Tags.",
        required: true,
      },
    ],
  },
  {
    subtype: "transform.lookup_person",
    kind: "transform",
    label: "Person-Lookup",
    description: "ID → vollständiges Person-Objekt mit allen Feldern.",
    outputFields: ["person"],
    configFields: [
      {
        key: "id_field",
        label: "ID-Feld",
        type: "text",
        placeholder: "person.id",
        required: true,
      },
    ],
  },

  // ======== ACTIONS ========
  {
    subtype: "action.create_reminder",
    kind: "action",
    label: "Reminder anlegen",
    description: "Neue pending Reminder für eine Person.",
    outputFields: ["reminder.id"],
    configFields: [
      {
        key: "person_id_field",
        label: "Person-ID-Feld",
        type: "text",
        placeholder: "person.id",
        required: true,
      },
      {
        key: "text",
        label: "Reminder-Text",
        type: "text",
        required: true,
      },
      {
        key: "remind_in_days",
        label: "In X Tagen",
        type: "number",
        placeholder: "7",
      },
    ],
  },
  {
    subtype: "action.add_tag",
    kind: "action",
    label: "Tag hinzufügen",
    description: "Hängt einen Tag an die Person.",
    outputFields: [],
    configFields: [
      {
        key: "tag",
        label: "Tag",
        type: "text",
        required: true,
      },
    ],
  },
  {
    subtype: "action.send_webhook",
    kind: "action",
    label: "Webhook senden",
    description: "POST an die konfigurierte URL.",
    outputFields: ["status"],
    configFields: [
      {
        key: "url",
        label: "URL",
        type: "text",
        placeholder: "https://hook.example.com/echo",
        required: true,
      },
      {
        key: "secret",
        label: "HMAC Secret (optional)",
        type: "text",
      },
    ],
  },
  {
    subtype: "action.send_email",
    kind: "action",
    label: "Email senden",
    description: "Über den konfigurierten Mail-Provider (V2).",
    outputFields: [],
    configFields: [
      { key: "to_field", label: "Empfänger-Feld", type: "text", placeholder: "person.emails[0]", required: true },
      { key: "subject", label: "Betreff", type: "text", required: true },
      { key: "body", label: "Body (Markdown)", type: "textarea", required: true },
    ],
  },
  {
    subtype: "action.push_hubspot",
    kind: "action",
    label: "Push HubSpot",
    description: "Sync zur HubSpot Contact-API (V2).",
    outputFields: ["hubspot_contact_id"],
    configFields: [
      {
        key: "list_id",
        label: "HubSpot Listen-ID (optional)",
        type: "text",
      },
    ],
  },
  {
    subtype: "action.notify",
    kind: "action",
    label: "Notification",
    description: "Browser-Notification + ECHO-Inbox-Pin.",
    outputFields: [],
    configFields: [
      { key: "text", label: "Text", type: "text", required: true },
    ],
  },
];

export function templatesByKind(
  kind: WorkflowNodeKind,
): NodeTemplate[] {
  return NODE_CATALOG.filter((t) => t.kind === kind);
}

export function findTemplate(subtype: string): NodeTemplate | undefined {
  return NODE_CATALOG.find((t) => t.subtype === subtype);
}
