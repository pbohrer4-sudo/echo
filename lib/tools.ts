import type Anthropic from "@anthropic-ai/sdk";

// The names of these tools become the discriminator for the
// commit endpoint, so don't rename them lightly.
export const TOOL_NAMES = [
  "create_person",
  "update_person",
  "log_interaction",
  "create_note",
  "create_reminder",
  "create_todo",
  "suggest_replies",
  "query_people",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const EXTRACTION_TOOLS: Anthropic.Tool[] = [
  {
    name: "create_person",
    description:
      "Lege eine neue Person an, wenn der Nutzer jemanden erwähnt, der noch nicht in seinem CRM ist. Prüfe vorher die Liste existierender Personen — bei einem Match nutze update_person mit deren UUID statt eine neue Person anzulegen. Alle Felder außer name sind optional; nur ausfüllen, was der Nutzer wirklich gesagt hat.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Vollständiger Name wie genannt." },
        company: { type: "string" },
        role: { type: "string" },
        scope: {
          type: "string",
          enum: ["work", "personal", "both"],
          description:
            "'work' bei beruflichem Kontext, 'personal' bei privatem, 'both' falls unklar.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Hobbys, Vorlieben, Gemeinsamkeiten, Themen — alles womit der Nutzer Personen später wiederfinden will. Beispiele: 'Tennis', 'Vegetarier', 'Kunde', 'München'.",
        },
        notes: {
          type: "string",
          description:
            "Letzte Wahl. Nur Hintergrund-Infos die ZU KEINEM strukturierten Feld passen. Beziehungen, wer-stellt-mich-vor, wann-getroffen, wo-getroffen, Geburtstage, Telefonnummern usw. gehören IMMER in die entsprechenden Felder (how_we_met, met_date, met_location, relationships, important_dates, phones, emails).",
        },
        how_we_met: {
          type: "string",
          description:
            "1-3 Saetze: Ort, Anlass, gemeinsame Bekannte. Z.B. 'Ueber Nick Rendino, auf der Bauma 2014 kennengelernt'. Wenn der Nutzer 'durch X' oder 'kennengelernt vor N Jahren' sagt, IMMER hier reinpacken - NIE in notes.",
        },
        met_date: {
          type: "string",
          description:
            "ISO-Datum YYYY-MM-DD wann ihr euch zum ersten Mal getroffen habt. Bei 'vor N Jahren' rechne current_year - N und setze 01-01 als Default-Tag, sofern kein genaues Datum gegeben.",
        },
        met_location: {
          type: "string",
          description:
            "Ort des ersten Treffens. Stadt oder Event-Name. Z.B. 'Muenchen', 'Bauma 2024', 'TUM Campus'.",
        },
        phones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description:
                  "z.B. mobile, iPhone, privat, arbeit, haupt, fax, andere",
              },
              value: { type: "string" },
            },
            required: ["value"],
          },
        },
        emails: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "z.B. persönlich, arbeit, schule, andere",
              },
              value: { type: "string" },
            },
            required: ["value"],
          },
        },
        addresses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "z.B. zuhause, arbeit, andere",
              },
              street: { type: "string" },
              city: { type: "string" },
              postal_code: { type: "string" },
              country: { type: "string" },
            },
          },
        },
        socials: {
          type: "array",
          items: {
            type: "object",
            properties: {
              platform: {
                type: "string",
                description:
                  "LinkedIn, Instagram, Twitter, GitHub, Mastodon, Bluesky, Threads, TikTok, Website, andere",
              },
              handle_or_url: {
                type: "string",
                description: "@handle oder volle URL.",
              },
            },
            required: ["platform", "handle_or_url"],
          },
        },
        important_dates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "Geburtstag, Hochzeitstag, Jahrestag, andere",
              },
              date: {
                type: "string",
                description: "ISO Datum YYYY-MM-DD.",
              },
              remind: {
                type: "boolean",
                description: "true wenn der Nutzer jährlich erinnert werden will.",
              },
            },
            required: ["label", "date"],
          },
        },
        relationships: {
          type: "array",
          description:
            "Beziehungen zu anderen Personen (Ehepartner, Mutter, Vater, Bruder, Schwester, Sohn, Tochter, Kollege, Freund, Mentor). NIEMALS in 'notes' packen — immer hier.",
          items: {
            type: "object",
            properties: {
              related_person_id: {
                type: "string",
                description:
                  "UUID der verknüpften Person, falls sie im Context bereits existiert.",
              },
              related_person_name: {
                type: "string",
                description:
                  "Name der verknüpften Person, falls sie im selben Turn neu via create_person angelegt wird ODER falls die UUID nicht bekannt ist.",
              },
              label: {
                type: "string",
                description:
                  "Beziehung. Empfohlen: 'Partner:in', 'Ehepartner:in', 'Mutter', 'Vater', 'Sohn', 'Tochter', 'Bruder', 'Schwester', 'Freund:in', 'Kolleg:in', 'Mentor:in', 'andere'.",
              },
            },
            required: ["label"],
          },
        },
      },
      required: ["name"],
    },
  },
  {
    name: "update_person",
    description:
      "Ergänze oder aktualisiere eine EXISTIERENDE Person. Nutze das, wenn der Nutzer neue Infos zu jemandem im CRM hinzufügt — z.B. neue Telefonnummer, Tag/Hobby, Firma. Skalare Felder (company, role, scope, notes) werden ersetzt; Array-Felder (add_tags, add_phones, …) werden ANGEHÄNGT statt ersetzt — der Nutzer verliert nie etwas durch Update. Setze nur die Felder, die der Nutzer tatsächlich erwähnt.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "UUID der Person aus der Context-Liste.",
        },
        company: { type: "string" },
        role: { type: "string" },
        scope: {
          type: "string",
          enum: ["work", "personal", "both"],
        },
        notes: {
          type: "string",
          description:
            "Letzte Wahl. ERSETZT das gesamte Notizen-Feld. Beziehungen, wer-stellt-mich-vor, wann-getroffen, wo-getroffen, Telefonnummern, Geburtstage usw. gehoeren IMMER in die strukturierten Felder (how_we_met, met_date, met_location, add_relationships, add_important_dates, add_phones, add_emails) - NIE in notes.",
        },
        how_we_met: {
          type: "string",
          description:
            "Wenn neu - wie ihr euch kennengelernt habt. Z.B. 'Durch Nick Rendino' oder 'Auf der Bauma 2014'. Bei 'durch X' oder 'ueber X' als Vermittler-Pattern IMMER hier reinpacken UND zusaetzlich eine add_relationships-Entry mit label='Vermittelt durch' und related_person_name='X' anlegen.",
        },
        met_date: {
          type: "string",
          description:
            "ISO YYYY-MM-DD. Bei 'vor N Jahren' rechne current_year - N und setze 01-01.",
        },
        met_location: {
          type: "string",
          description: "Ort des ersten Treffens.",
        },
        add_tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Wird zu existierenden Tags hinzugefügt. Duplikate werden gefiltert.",
        },
        add_phones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
            },
            required: ["value"],
          },
        },
        add_emails: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
            },
            required: ["value"],
          },
        },
        add_addresses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              street: { type: "string" },
              city: { type: "string" },
              postal_code: { type: "string" },
              country: { type: "string" },
            },
          },
        },
        add_socials: {
          type: "array",
          items: {
            type: "object",
            properties: {
              platform: { type: "string" },
              handle_or_url: { type: "string" },
            },
            required: ["platform", "handle_or_url"],
          },
        },
        add_important_dates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              date: { type: "string" },
              remind: { type: "boolean" },
            },
            required: ["label", "date"],
          },
        },
        add_relationships: {
          type: "array",
          description:
            "Neue Beziehungen anhängen (Ehepartner, Mutter, Vater, Bruder, Schwester, Sohn, Tochter, Kollege, Freund, Mentor). NIEMALS in 'notes' packen.",
          items: {
            type: "object",
            properties: {
              related_person_id: {
                type: "string",
                description: "UUID der verknüpften Person, falls bekannt.",
              },
              related_person_name: {
                type: "string",
                description:
                  "Name der verknüpften Person — wird serverseitig zur UUID aufgelöst.",
              },
              label: {
                type: "string",
                description:
                  "Beziehung wie 'Ehepartner:in', 'Mutter', 'Bruder', 'Kolleg:in' etc.",
              },
            },
            required: ["label"],
          },
        },
      },
      required: ["id"],
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
    name: "query_people",
    description:
      "Filtere oder suche Personen in der People-Tabelle. Nutze, wenn der Nutzer eine Such-/Filterfrage stellt — z.B. 'zeig mir alle in München mit Padel', 'wer ist im Inneren Kreis', 'finde Geburtstage diese Woche', 'wer hat keinen Kontakt seit 6 Monaten'. Alle Felder sind optional — nur die ausfüllen, die der Nutzer wirklich genannt hat. Der Nutzer wird zur /people-Liste mit gesetzten Filtern navigiert und du bekommst die Trefferzahl + ersten Namen als Kontext zurück um zu antworten.",
    input_schema: {
      type: "object",
      properties: {
        free_text: {
          type: "string",
          description:
            "Freitext-Suche über Name, Firma, Rolle, Notizen, Locations, Tag-Namen, Passion-Namen, Circle-Namen. Z.B. 'Müller', 'Bauma', 'vegetarisch'.",
        },
        mode: {
          type: "string",
          enum: ["active", "nurture", "dormant", "reconnect", "archive"],
          description:
            "Kontakt-Modus. active = laufender Austausch, nurture = pflegen, dormant = schläft, reconnect = wieder anknüpfen, archive = stillgelegt.",
        },
        purpose: {
          type: "string",
          enum: ["personal", "family", "business_active", "business_latent", "aspirational"],
          description:
            "Zweck der Beziehung. personal = privat, family = Familie, business_active = aktives Business, business_latent = potenzielles Business, aspirational = Vorbild/Lernen-von.",
        },
        depth: {
          type: "string",
          enum: ["inner_5", "trusted_15", "active_50", "network_150", "periphery_500"],
          description:
            "Dunbar-Tiefenstufe. inner_5 = Innerer Kreis, trusted_15 = Vertrauter Kreis, active_50 = Aktiver Kreis, network_150 = Netzwerk, periphery_500 = Peripherie.",
        },
        cluster: {
          type: "string",
          enum: ["reminders", "interests", "potential", "origin"],
          description:
            "Tag-Cluster der die Person mindestens ein Tag haben muss.",
        },
        tag: {
          type: "string",
          description:
            "Exakter Tag-Name (case-insensitive). Z.B. 'padel', 'q3-follow-up', 'stammtisch'.",
        },
        passion: {
          type: "string",
          description:
            "Passion-Name (case-insensitive). Z.B. 'padel', 'klassik', 'klettern'.",
        },
        circle: {
          type: "string",
          description:
            "Circle-Name (case-insensitive Substring-Match). Z.B. 'Bauma', 'YC W22', 'Munich Founder'.",
        },
        location: {
          type: "string",
          description:
            "Stadt- oder Ortsname. Matched gegen current_location, home_location und met_location. Case-insensitive Substring-Match.",
        },
        channel: {
          type: "string",
          enum: ["has_phone", "has_email", "has_linkedin"],
          description:
            "Nur Personen mit hinterlegtem Kommunikationskanal anzeigen.",
        },
      },
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
