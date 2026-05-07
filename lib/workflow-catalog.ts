import type { WorkflowNodeKind } from "@/lib/types";
import type { TaskId } from "@/lib/model-catalog";

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
  // True when the node only depends on ECHO-native data + logic and
  // will work as soon as the V2 runtime lands. False when it needs an
  // external service (Vercel cron, webhook receiver, mail provider,
  // OAuth-token vault, etc.) before it can execute.
  live: boolean;
  // When set, this node uses an LLM. Resolution order at runtime:
  //   node.config.model_id    (per-node override picked in ConfigPanel)
  //   workflow.default_model_preferences[requires_task]
  //   profile.model_preferences[requires_task]
  //   TASKS.find(t => t.id === requires_task).default_model
  // The ConfigPanel auto-renders a model picker for nodes that have
  // requires_task set.
  requires_task?: TaskId;
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
    live: true,
  },
  {
    subtype: "trigger.person_created",
    kind: "trigger",
    label: "Person erstellt",
    description: "Bei jeder neu angelegten Person.",
    outputFields: ["person.id", "person.name", "person.company", "person.scope"],
    configFields: [],
    live: true,
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
    live: true,
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
    live: true,
  },
  {
    subtype: "trigger.reminder_due",
    kind: "trigger",
    label: "Reminder fällig",
    description: "Wenn ein Reminder seinen remind_at erreicht.",
    outputFields: ["reminder.id", "reminder.text", "person.id"],
    configFields: [],
    live: true,
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
    live: false,
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
    live: false,
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
    live: true,
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
    live: true,
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
    live: true,
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
    live: true,
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
    live: true,
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
    live: true,
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
    live: true,
  },
  {
    subtype: "transform.lookup_organization",
    kind: "transform",
    label: "Org-Lookup",
    description: "Holt Organisation per ID oder Name aus dem CRM.",
    outputFields: ["organization"],
    configFields: [
      {
        key: "ref_field",
        label: "Referenz-Feld",
        type: "text",
        placeholder: "person.organization_id oder person.company",
        required: true,
      },
    ],
    live: true,
  },

  // ======== AI TRANSFORMS ========
  // Each of these uses an LLM and surfaces a model picker in the
  // ConfigPanel. requires_task tells the resolution chain which slot
  // in the model preferences to read.
  {
    subtype: "transform.ai_summarize",
    kind: "transform",
    label: "AI · Zusammenfassen",
    description:
      "Verdichtet einen Text auf 1-3 Sätze. Modell pro Node oder vom Workflow geerbt.",
    outputFields: ["summary"],
    configFields: [
      {
        key: "input_field",
        label: "Input-Feld",
        type: "text",
        placeholder: "interaction.transcript",
        required: true,
      },
      {
        key: "max_sentences",
        label: "Maximale Sätze",
        type: "number",
        placeholder: "3",
      },
    ],
    live: false,
    requires_task: "chat",
  },
  {
    subtype: "transform.ai_classify",
    kind: "transform",
    label: "AI · Klassifizieren",
    description:
      "Schlägt Tags / Kategorien aus dem Inhalt vor. Mehr-Label-Output.",
    outputFields: ["categories", "primary_category"],
    configFields: [
      {
        key: "input_field",
        label: "Input-Feld",
        type: "text",
        placeholder: "person.notes oder interaction.transcript",
        required: true,
      },
      {
        key: "label_set",
        label: "Erlaubte Labels (Komma-separiert)",
        type: "textarea",
        placeholder: "Lead, Kunde, Partner, Interesse, Spam",
      },
    ],
    live: false,
    requires_task: "chat",
  },
  {
    subtype: "transform.ai_extract_fields",
    kind: "transform",
    label: "AI · Felder extrahieren",
    description:
      "Strukturierte JSON-Felder aus Freitext (Tool-Use). Für Email-Signatur, Notizen, Web-Scrape.",
    outputFields: ["extracted"],
    configFields: [
      {
        key: "input_field",
        label: "Input-Feld",
        type: "text",
        placeholder: "input.text",
        required: true,
      },
      {
        key: "schema_hint",
        label: "Felder die gesucht werden",
        type: "textarea",
        placeholder: "name, company, role, email, phone",
        required: true,
      },
    ],
    live: false,
    requires_task: "extract",
  },
  {
    subtype: "transform.ai_ocr",
    kind: "transform",
    label: "AI · Bild zu Daten",
    description:
      "OCR + Strukturierung. Visitenkarte, Whiteboard-Foto, Screenshot — Vision-fähiges Modell nötig.",
    outputFields: ["text", "structured"],
    configFields: [
      {
        key: "image_field",
        label: "Bild-URL Feld",
        type: "text",
        placeholder: "input.image_url",
        required: true,
      },
      {
        key: "kind_hint",
        label: "Was wird erkannt?",
        type: "select",
        options: ["Visitenkarte", "Notiz", "Whiteboard", "Screenshot", "Sonstiges"],
      },
    ],
    live: false,
    requires_task: "vision",
  },
  {
    subtype: "transform.ai_research",
    kind: "transform",
    label: "AI · Web-Recherche",
    description:
      "Frische Web-Daten zu einer Org oder Person. Perplexity / Gemini / GPT-Search empfohlen.",
    outputFields: ["findings", "sources"],
    configFields: [
      {
        key: "query_template",
        label: "Recherche-Prompt",
        type: "textarea",
        placeholder: "Recent funding rounds for {{organization.name}}",
        required: true,
      },
    ],
    live: false,
    requires_task: "enrich",
  },
  {
    subtype: "action.ai_draft_email",
    kind: "action",
    label: "AI · Email-Entwurf",
    description:
      "Generiert einen Draft passend zum Anlass. Wird in Outbox gepusht, nicht direkt versendet.",
    outputFields: ["draft.subject", "draft.body"],
    configFields: [
      {
        key: "tone",
        label: "Tonalität",
        type: "select",
        options: ["Formal", "Freundschaftlich", "Direkt", "Wärmer"],
      },
      {
        key: "context_field",
        label: "Kontext-Feld",
        type: "text",
        placeholder: "interaction.summary",
      },
    ],
    live: false,
    requires_task: "chat",
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
    live: true,
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
    live: true,
  },
  {
    subtype: "action.update_person",
    kind: "action",
    label: "Person aktualisieren",
    description: "Skalare Felder ersetzen (company, role, scope, notes).",
    outputFields: [],
    configFields: [
      {
        key: "person_id_field",
        label: "Person-ID-Feld",
        type: "text",
        placeholder: "person.id",
        required: true,
      },
      {
        key: "field",
        label: "Feld",
        type: "select",
        options: ["company", "role", "scope", "notes"],
        required: true,
      },
      {
        key: "value",
        label: "Neuer Wert",
        type: "text",
      },
    ],
    live: true,
  },
  {
    subtype: "action.notify",
    kind: "action",
    label: "Notification",
    description: "Browser-Notification (sobald V2-Runtime läuft).",
    outputFields: [],
    configFields: [
      { key: "text", label: "Text", type: "text", required: true },
    ],
    live: true,
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
    live: false,
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
    live: false,
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
    live: false,
  },
  {
    subtype: "action.lookup_hubspot",
    kind: "action",
    label: "HubSpot Lookup",
    description: "Sucht ob Person in HubSpot existiert; gibt Match zurück.",
    outputFields: ["hubspot.contact_id", "hubspot.found"],
    configFields: [
      {
        key: "match_field",
        label: "Match auf",
        type: "select",
        options: ["email", "phone", "name"],
        required: true,
      },
    ],
    live: false,
  },
  {
    subtype: "action.linkedin_enrich",
    kind: "action",
    label: "LinkedIn anreichern",
    description: "Public Profile suchen + Felder ergänzen (V2, ToS-abhängig).",
    outputFields: ["linkedin_url", "title", "company"],
    configFields: [
      {
        key: "name_field",
        label: "Name-Feld",
        type: "text",
        placeholder: "person.name",
        required: true,
      },
    ],
    live: false,
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
