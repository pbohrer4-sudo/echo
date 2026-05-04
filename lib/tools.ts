import type Anthropic from "@anthropic-ai/sdk";

// The names of these tools become the discriminator for the
// commit endpoint, so don't rename them lightly.
export const TOOL_NAMES = [
  "create_person",
  "log_interaction",
  "create_note",
  "create_reminder",
  "create_todo",
  "suggest_replies",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const EXTRACTION_TOOLS: Anthropic.Tool[] = [
  {
    name: "create_person",
    description:
      "Lege eine neue Person an, wenn der Nutzer jemanden erwähnt, der noch nicht in seinem CRM ist. Prüfe vorher die Liste existierender Personen — bei einem Match nutze deren UUID statt eine neue Person anzulegen.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Vollständiger Name wie genannt." },
        company: { type: "string", description: "Firma, falls erwähnt." },
        role: { type: "string", description: "Rolle/Position, falls erwähnt." },
        scope: {
          type: "string",
          enum: ["work", "personal", "both"],
          description:
            "'work' bei beruflichem Kontext (Kollege, Kunde), 'personal' bei privatem (Familie, Freund), 'both' falls unklar.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags wie 'Kunde', 'Marketing', 'Schule'.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "log_interaction",
    description:
      "Protokolliere ein Treffen, Anruf, Email oder eine andere Interaktion. Nutze person_ids für existierende Personen (UUIDs). Falls die Person mit create_person im selben Turn neu angelegt wird, gib stattdessen den Namen in person_names an.",
    input_schema: {
      type: "object",
      properties: {
        person_ids: {
          type: "array",
          items: { type: "string" },
          description: "UUIDs existierender Personen aus dem Context.",
        },
        person_names: {
          type: "array",
          items: { type: "string" },
          description:
            "Namen neu angelegter Personen, die im selben Turn via create_person entstehen.",
        },
        type: {
          type: "string",
          enum: ["meeting", "call", "email", "note", "voice"],
        },
        summary: {
          type: "string",
          description: "1-2 Sätze, worum es ging und was rauskam.",
        },
        sentiment: {
          type: "string",
          enum: ["positive", "neutral", "tense"],
        },
        topics: { type: "array", items: { type: "string" } },
        occurred_at: {
          type: "string",
          description:
            "ISO 8601 Datum/Zeit. 'jetzt' für aktuell, sonst aus dem Kontext ableiten.",
        },
      },
      required: ["type", "summary", "occurred_at"],
    },
  },
  {
    name: "create_note",
    description:
      "Speichere eine Freitext-Notiz, optional zu einer Person. Nutze für Beobachtungen, Eindrücke, Hintergrund — alles was kein zeitgebundenes Event ist.",
    input_schema: {
      type: "object",
      properties: {
        person_id: { type: "string", description: "Optional UUID." },
        person_name: {
          type: "string",
          description: "Optional Name einer im selben Turn neu angelegten Person.",
        },
        title: { type: "string" },
        body: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["body"],
    },
  },
  {
    name: "create_reminder",
    description:
      "Lege eine Erinnerung an — typisch Versprechen ('Pricing bis Mittwoch'), Geburtstag, Check-in. remind_at als ISO 8601, recurrence default 'once'.",
    input_schema: {
      type: "object",
      properties: {
        person_id: { type: "string" },
        person_name: { type: "string" },
        text: { type: "string" },
        remind_at: { type: "string", description: "ISO 8601." },
        recurrence: {
          type: "string",
          enum: ["once", "weekly", "monthly", "yearly"],
        },
        type: {
          type: "string",
          enum: ["check-in", "birthday", "promise", "custom"],
        },
      },
      required: ["text", "remind_at", "recurrence", "type"],
    },
  },
  {
    name: "create_todo",
    description:
      "Lege eine ToDo an — Aufgabe ohne festes Zeitfenster, aber mit optionalem Fälligkeitsdatum.",
    input_schema: {
      type: "object",
      properties: {
        person_id: { type: "string" },
        person_name: { type: "string" },
        text: { type: "string" },
        due_date: { type: "string", description: "Optional ISO Datum (nur Datum, keine Zeit)." },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
      },
      required: ["text"],
    },
  },
  {
    name: "suggest_replies",
    description:
      "Schlage 2-5 kurze Antwort-Chips vor, die der Nutzer antippen kann statt zu sprechen. Nutze das, wenn du eine geschlossene Frage stellst (z.B. beruflich/privat/beides, ja/nein, oder eine Liste von Prioritäten). Pro Chip max. 3 Wörter, in der Sprache des Nutzers, ohne Punkt am Ende.",
    input_schema: {
      type: "object",
      properties: {
        replies: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 5,
        },
      },
      required: ["replies"],
    },
  },
];

export interface ToolCall {
  name: ToolName;
  input: Record<string, unknown>;
}
