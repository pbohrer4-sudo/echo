import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/claude";

export type SupportedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

export interface BusinessCardData {
  name: string | null;
  company: string | null;
  role: string | null;
  phones: { label: string; value: string }[];
  emails: { label: string; value: string }[];
  addresses: {
    label: string;
    street: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
  }[];
  socials: { platform: string; handle_or_url: string }[];
}

const EMPTY: BusinessCardData = {
  name: null,
  company: null,
  role: null,
  phones: [],
  emails: [],
  addresses: [],
  socials: [],
};

const TOOL: Anthropic.Tool = {
  name: "extract_business_card",
  description:
    "Strukturierte Daten von einer Visitenkarte extrahieren. Setze nur Felder, die wirklich auf der Karte stehen — keine Halluzinationen, keine Vermutungen. Wenn ein Feld unklar ist: weglassen.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Vor- und Nachname." },
      company: { type: "string" },
      role: { type: "string", description: "Rolle/Position/Titel." },
      phones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description:
                "z.B. mobile, arbeit, fax, haupt — basierend auf der Karte ('mobil' / 'M' / 'tel' / 'fax').",
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
            label: { type: "string", description: "arbeit, persönlich, andere" },
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
            label: { type: "string", description: "arbeit, zuhause, andere" },
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
            handle_or_url: { type: "string" },
          },
          required: ["platform", "handle_or_url"],
        },
      },
    },
  },
};

let sharedClient: Anthropic | null = null;

function getClient(apiKey?: string | null): Anthropic {
  if (apiKey) return new Anthropic({ apiKey });
  if (!sharedClient) {
    sharedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return sharedClient;
}

export async function extractBusinessCard({
  imageBase64,
  mediaType,
  apiKey,
}: {
  imageBase64: string;
  mediaType: SupportedMediaType;
  apiKey?: string | null;
}): Promise<BusinessCardData> {
  const response = await getClient(apiKey).messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "extract_business_card" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: "Das ist ein Foto einer Visitenkarte. Extrahiere die Kontaktdaten via Tool. Bei mehrsprachigen Karten: die Felder so übernehmen wie sie auf der Karte stehen.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) return EMPTY;

  const input = toolUse.input as Partial<BusinessCardData>;
  return {
    name: stringOrNull(input.name),
    company: stringOrNull(input.company),
    role: stringOrNull(input.role),
    phones: cleanPhones(input.phones),
    emails: cleanEmails(input.emails),
    addresses: cleanAddresses(input.addresses),
    socials: cleanSocials(input.socials),
  };
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function cleanPhones(v: unknown): BusinessCardData["phones"] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const obj = e as Record<string, unknown>;
      const value = stringOrNull(obj.value);
      if (!value) return null;
      return { label: stringOrNull(obj.label) ?? "mobile", value };
    })
    .filter((e): e is BusinessCardData["phones"][number] => e !== null);
}

function cleanEmails(v: unknown): BusinessCardData["emails"] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const obj = e as Record<string, unknown>;
      const value = stringOrNull(obj.value);
      if (!value) return null;
      return { label: stringOrNull(obj.label) ?? "arbeit", value };
    })
    .filter((e): e is BusinessCardData["emails"][number] => e !== null);
}

function cleanAddresses(v: unknown): BusinessCardData["addresses"] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const obj = e as Record<string, unknown>;
      const street = stringOrNull(obj.street);
      const city = stringOrNull(obj.city);
      if (!street && !city) return null;
      return {
        label: stringOrNull(obj.label) ?? "arbeit",
        street,
        city,
        postal_code: stringOrNull(obj.postal_code),
        country: stringOrNull(obj.country),
      };
    })
    .filter((e): e is BusinessCardData["addresses"][number] => e !== null);
}

function cleanSocials(v: unknown): BusinessCardData["socials"] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const obj = e as Record<string, unknown>;
      const handle = stringOrNull(obj.handle_or_url);
      if (!handle) return null;
      return {
        platform: stringOrNull(obj.platform) ?? "andere",
        handle_or_url: handle,
      };
    })
    .filter((e): e is BusinessCardData["socials"][number] => e !== null);
}
