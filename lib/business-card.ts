// Visitenkarten-Scan auf Mistral OCR (document_annotation_format).
// Vorher lief der Scan über Claude Vision — gut, aber teurer und ohne
// dedizierten OCR-Pfad für PDFs/HEICs. Mistral OCR erkennt Text
// zuverlässig und liefert in einem einzigen API-Call direkt das
// strukturierte JSON gemäß BusinessCard-Schema.

import { mistralOcr, MISTRAL_OCR_MODEL, type MistralMediaType, type OcrSchema } from "@/lib/mistral-ocr";

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

// JSON-Schema das Mistral als document_annotation_format bekommt.
// Strikt halten wir bewusst NICHT — Visitenkarten haben oft Lücken
// (kein Email, keine Adresse) und Mistral macht's mit lockerem Mode
// nicht schlechter, dafür kommt mehr durch.
const SCHEMA: OcrSchema = {
  name: "business_card",
  description:
    "Strukturierte Kontaktdaten einer Visitenkarte. Nur Felder ausfüllen die wirklich lesbar sind — keine Halluzinationen. Mehrsprachige Karten: Werte so übernehmen wie sie auf der Karte stehen.",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Vor- und Nachname" },
      company: { type: "string", description: "Firmenname" },
      role: { type: "string", description: "Rolle/Position/Titel" },
      phones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description:
                "z.B. mobile, arbeit, fax, haupt — basierend auf der Karte (mobil/M/tel/fax)",
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
              description: "arbeit, persönlich, andere",
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

export interface BusinessCardResult {
  data: BusinessCardData;
  // Für Logging. Mistral OCR rechnet in Seiten ab — pagesProcessed=1
  // bei Einzelbildern, mehr nur bei Multi-Page-PDFs.
  usage: {
    pages_processed: number;
  };
  model: string;
}

export async function extractBusinessCard({
  imageBase64,
  mediaType,
  apiKey,
}: {
  imageBase64: string;
  mediaType: SupportedMediaType | "application/pdf";
  // BYO Mistral-Key aus dem User-Profil; fällt auf MISTRAL_API_KEY zurück.
  apiKey?: string | null;
}): Promise<BusinessCardResult> {
  const result = await mistralOcr<Partial<BusinessCardData>>({
    base64: imageBase64,
    mediaType: mediaType as MistralMediaType,
    schema: SCHEMA,
    apiKey,
  });

  if (!result.annotation) {
    return {
      data: EMPTY,
      usage: { pages_processed: result.pagesProcessed },
      model: result.model,
    };
  }

  const a = result.annotation;
  return {
    data: {
      name: stringOrNull(a.name),
      company: stringOrNull(a.company),
      role: stringOrNull(a.role),
      phones: cleanPhones(a.phones),
      emails: cleanEmails(a.emails),
      addresses: cleanAddresses(a.addresses),
      socials: cleanSocials(a.socials),
    },
    usage: { pages_processed: result.pagesProcessed },
    model: result.model || MISTRAL_OCR_MODEL,
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
