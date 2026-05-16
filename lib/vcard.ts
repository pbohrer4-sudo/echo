// Minimal vCard 3.0/4.0 parser sized for Apple Contacts exports.
// Handles line-folding (continuation lines starting with space/tab),
// TYPE parameters (TEL;TYPE=mobile, EMAIL;TYPE=work, etc.), structured
// values (N, ORG, ADR), simple base64 PHOTO skip, multi-value via
// repeated property lines.
//
// Returns parsed VCardContact records ready to feed into the existing
// createPerson code path. Skips entries that don't have a usable name.

import type { AddressEntry, EmailEntry, PhoneEntry, SocialEntry } from "@/lib/types";

export interface VCardContact {
  name: string;
  company: string | null;
  role: string | null;
  phones: PhoneEntry[];
  emails: EmailEntry[];
  addresses: AddressEntry[];
  socials: SocialEntry[];
  birthday: string | null;
  notes: string | null;
}

const PHONE_LABEL_MAP: Record<string, string> = {
  cell: "mobile",
  mobile: "mobile",
  iphone: "iPhone",
  home: "privat",
  work: "arbeit",
  main: "haupt",
  fax: "fax",
};

const EMAIL_LABEL_MAP: Record<string, string> = {
  home: "persönlich",
  personal: "persönlich",
  work: "arbeit",
  internet: "andere",
};

const ADDRESS_LABEL_MAP: Record<string, string> = {
  home: "zuhause",
  work: "arbeit",
};

const SOCIAL_PLATFORM_NORMALIZER: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "Twitter",
  x: "Twitter",
  instagram: "Instagram",
  github: "GitHub",
  threads: "Threads",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  tiktok: "TikTok",
  facebook: "andere",
};

// ───────── Public API ─────────

export function parseVcards(raw: string): VCardContact[] {
  const text = raw.replace(/\r\n/g, "\n");
  const blocks = splitBlocks(text);
  const out: VCardContact[] = [];
  for (const block of blocks) {
    const contact = parseBlock(block);
    if (contact && contact.name.trim()) out.push(contact);
  }
  return out;
}

// ───────── Internals ─────────

function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split("\n");
  let buf: string[] = [];
  let inside = false;
  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VCARD") {
      inside = true;
      buf = [];
      continue;
    }
    if (upper === "END:VCARD") {
      if (inside) blocks.push(unfold(buf).join("\n"));
      inside = false;
      buf = [];
      continue;
    }
    if (inside) buf.push(line);
  }
  return blocks;
}

// vCard line-folding: continuation lines start with a single space or
// tab; that whitespace is dropped and the line concatenates with the
// previous one.
function unfold(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (result.length > 0) result[result.length - 1] += line.slice(1);
    } else {
      result.push(line);
    }
  }
  return result;
}

interface ParsedLine {
  property: string;
  params: Record<string, string[]>;
  value: string;
}

function parseLine(line: string): ParsedLine | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);

  const parts = head.split(";");
  const property = parts[0]?.toUpperCase().trim() ?? "";
  if (!property) return null;

  const params: Record<string, string[]> = {};
  for (let i = 1; i < parts.length; i++) {
    const piece = parts[i];
    const eq = piece.indexOf("=");
    if (eq === -1) {
      // Pre-v3 style: TYPE was sometimes just `;TYPE` or `;TYPE,TYPE`
      const key = "TYPE";
      const v = piece.trim();
      if (v) {
        params[key] = (params[key] ?? []).concat(v);
      }
    } else {
      const key = piece.slice(0, eq).toUpperCase().trim();
      const rawVal = piece.slice(eq + 1);
      const values = rawVal
        .split(",")
        .map((v) => v.replace(/^"|"$/g, "").trim())
        .filter(Boolean);
      params[key] = (params[key] ?? []).concat(values);
    }
  }

  return { property, params, value };
}

function unescapeValue(v: string): string {
  return v
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function pickType(params: Record<string, string[]>): string[] {
  const types = params["TYPE"] ?? [];
  return types.map((t) => t.toLowerCase());
}

function mapPhoneLabel(types: string[]): string {
  for (const t of types) {
    if (PHONE_LABEL_MAP[t]) return PHONE_LABEL_MAP[t];
  }
  return "andere";
}

function mapEmailLabel(types: string[]): string {
  for (const t of types) {
    if (EMAIL_LABEL_MAP[t]) return EMAIL_LABEL_MAP[t];
  }
  return "persönlich";
}

function mapAddressLabel(types: string[]): string {
  for (const t of types) {
    if (ADDRESS_LABEL_MAP[t]) return ADDRESS_LABEL_MAP[t];
  }
  return "andere";
}

// vCard URL/X-SOCIALPROFILE detector. Extracts the platform from the
// host or the type parameter, falls back to "Website".
function classifySocial(url: string, types: string[]): SocialEntry | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Most explicit signal: X-SOCIALPROFILE comes with TYPE=service.
  for (const t of types) {
    if (SOCIAL_PLATFORM_NORMALIZER[t]) {
      return {
        platform: SOCIAL_PLATFORM_NORMALIZER[t],
        handle_or_url: trimmed,
      };
    }
  }

  const lower = trimmed.toLowerCase();
  if (/linkedin\.com/.test(lower))
    return { platform: "LinkedIn", handle_or_url: trimmed };
  if (/(twitter\.com|x\.com)/.test(lower))
    return { platform: "Twitter", handle_or_url: trimmed };
  if (/instagram\.com/.test(lower))
    return { platform: "Instagram", handle_or_url: trimmed };
  if (/github\.com/.test(lower))
    return { platform: "GitHub", handle_or_url: trimmed };
  if (/bsky\.app/.test(lower))
    return { platform: "Bluesky", handle_or_url: trimmed };
  if (/threads\.net/.test(lower))
    return { platform: "Threads", handle_or_url: trimmed };
  if (/mastodon|fosstodon|hachyderm/.test(lower))
    return { platform: "Mastodon", handle_or_url: trimmed };
  if (/tiktok\.com/.test(lower))
    return { platform: "TikTok", handle_or_url: trimmed };

  return { platform: "Website", handle_or_url: trimmed };
}

function parseAddress(value: string, types: string[]): AddressEntry | null {
  // ADR is structured with 7 components separated by `;`:
  //   po-box; extended; street; locality; region; postal-code; country
  const parts = value.split(";").map(unescapeValue);
  while (parts.length < 7) parts.push("");
  const street = parts[2] || null;
  const city = parts[3] || null;
  const postal_code = parts[5] || null;
  const country = parts[6] || null;
  if (!street && !city && !postal_code) return null;
  return {
    label: mapAddressLabel(types),
    street,
    city,
    postal_code,
    country,
  };
}

function parseBirthday(value: string): string | null {
  const v = value.trim();
  // Apple emits YYYY-MM-DD (2016-03-14) or YYYYMMDD (20160314). Strip
  // VALUE=DATE prefix if present.
  const m = v.match(/(\d{4})-?(\d{2})-?(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseBlock(block: string): VCardContact | null {
  const contact: VCardContact = {
    name: "",
    company: null,
    role: null,
    phones: [],
    emails: [],
    addresses: [],
    socials: [],
    birthday: null,
    notes: null,
  };

  const lines = block.split("\n");
  let formattedName = "";
  let structuredName = "";

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("VERSION:")) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { property, params, value } = parsed;

    // Skip base64 photos and any property whose value is encoded
    // binary — keeping them would bloat preview cards uselessly.
    if (property === "PHOTO" || params["ENCODING"]?.includes("b")) continue;

    switch (property) {
      case "FN":
        formattedName = unescapeValue(value);
        break;
      case "N": {
        // family;given;additional;prefix;suffix → "Given Family"
        const parts = value.split(";").map(unescapeValue);
        const family = parts[0] ?? "";
        const given = parts[1] ?? "";
        structuredName = [given, family].filter(Boolean).join(" ").trim();
        break;
      }
      case "ORG": {
        const parts = value.split(";").map(unescapeValue);
        contact.company = parts[0] ?? null;
        break;
      }
      case "TITLE":
        contact.role = unescapeValue(value) || null;
        break;
      case "TEL": {
        const v = unescapeValue(value);
        if (!v) break;
        contact.phones.push({
          label: mapPhoneLabel(pickType(params)),
          value: v,
        });
        break;
      }
      case "EMAIL": {
        const v = unescapeValue(value);
        if (!v) break;
        contact.emails.push({
          label: mapEmailLabel(pickType(params)),
          value: v,
        });
        break;
      }
      case "ADR": {
        const a = parseAddress(value, pickType(params));
        if (a) contact.addresses.push(a);
        break;
      }
      case "BDAY":
      case "ANNIVERSARY": {
        const d = parseBirthday(value);
        if (property === "BDAY" && d) contact.birthday = d;
        // Anniversaries handled by the form via important_dates;
        // leaving them out of vCard import for now since we need to
        // express label + remind flag separately.
        break;
      }
      case "NOTE": {
        const v = unescapeValue(value);
        if (v) {
          contact.notes = contact.notes ? `${contact.notes}\n\n${v}` : v;
        }
        break;
      }
      case "URL":
      case "X-SOCIALPROFILE": {
        const social = classifySocial(unescapeValue(value), pickType(params));
        if (social) contact.socials.push(social);
        break;
      }
    }
  }

  contact.name = formattedName || structuredName;
  if (!contact.name) return null;
  return contact;
}

// ─────────────────────────── Builder ───────────────────────────
// vCard 3.0 Output für QR-Codes / .vcf-Download. Wir generieren das
// Spec-Subset das echo aktiv nutzt: N + FN, ORG, TITLE, TEL (mit
// TYPE), EMAIL (mit TYPE), URL, ADR, BDAY, NOTE. Output ist CRLF-
// terminiert (vCard-Standard); QR-Encoder sind damit OK.

import type { Person, PersonContact, ContactChannel as Channel } from "@/lib/types";

function vEscape(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return {
    first: parts.slice(0, -1).join(" "),
    last: parts[parts.length - 1],
  };
}

function vCardPhoneType(c: PersonContact): string {
  const sub = c.subtype?.toLowerCase() ?? "";
  if (sub.includes("mobil") || sub.includes("iphone")) return "CELL";
  if (sub.includes("landline") || sub.includes("festnetz")) return "HOME";
  if (sub.includes("work") || sub.includes("arbeit") || sub.includes("office"))
    return "WORK";
  if (sub.includes("fax")) return "FAX";
  return "VOICE";
}

function vCardEmailType(c: PersonContact): string {
  const sub = c.subtype?.toLowerCase() ?? "";
  if (sub.includes("work") || sub.includes("arbeit") || sub.includes("office"))
    return "WORK";
  if (sub.includes("private") || sub.includes("privat")) return "HOME";
  return "INTERNET";
}

function socialUrl(channel: Channel, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  switch (channel) {
    case "linkedin":
      return `https://linkedin.com/in/${v.replace(/^@/, "")}`;
    case "instagram":
      return `https://instagram.com/${v.replace(/^@/, "")}`;
    case "twitter":
      return `https://twitter.com/${v.replace(/^@/, "")}`;
    case "github":
      return `https://github.com/${v.replace(/^@/, "")}`;
    case "telegram":
      return `https://t.me/${v.replace(/^@/, "")}`;
    case "calendly":
      return `https://calendly.com/${v.replace(/^@/, "")}`;
    case "website":
      return `https://${v}`;
    default:
      return null;
  }
}

export function buildVCard({
  person,
  contacts,
}: {
  person: Person;
  contacts: PersonContact[];
}): string {
  const { first, last } = splitFullName(person.name);
  const lines: string[] = [];
  lines.push("BEGIN:VCARD");
  lines.push("VERSION:3.0");
  lines.push(`N:${vEscape(last)};${vEscape(first)};;;`);
  lines.push(`FN:${vEscape(person.name)}`);
  if (person.company) lines.push(`ORG:${vEscape(person.company)}`);
  if (person.role) lines.push(`TITLE:${vEscape(person.role)}`);
  if (person.notes) lines.push(`NOTE:${vEscape(person.notes)}`);

  for (const c of contacts) {
    if (c.channel === "phone") {
      lines.push(`TEL;TYPE=${vCardPhoneType(c)}:${vEscape(c.value)}`);
    } else if (c.channel === "whatsapp") {
      lines.push(`TEL;TYPE=CELL:${vEscape(c.value)}`);
    } else if (c.channel === "sms") {
      lines.push(`TEL;TYPE=CELL,TEXT:${vEscape(c.value)}`);
    } else if (c.channel === "email") {
      lines.push(`EMAIL;TYPE=${vCardEmailType(c)}:${vEscape(c.value)}`);
    } else {
      const url = socialUrl(c.channel, c.value);
      if (url) lines.push(`URL:${vEscape(url)}`);
    }
  }

  // Legacy linkedin_url als URL anhängen, falls keine
  // person_contacts-Row für LinkedIn existiert.
  const hasLinkedinContact = contacts.some((c) => c.channel === "linkedin");
  if (!hasLinkedinContact && person.linkedin_url) {
    lines.push(`URL:${vEscape(person.linkedin_url)}`);
  }

  // Adressen aus JSONB (max 3, sonst wird der QR-Code zu dicht).
  for (const a of (person.addresses ?? []).slice(0, 3)) {
    const street = vEscape(a.street ?? "");
    const city = vEscape(a.city ?? "");
    const postal = vEscape(a.postal_code ?? "");
    const country = vEscape(a.country ?? "");
    if (!street && !city && !postal && !country) continue;
    const adr = ["", "", street, city, "", postal, country].join(";");
    const sub = a.label?.toLowerCase() ?? "";
    let type = "OTHER";
    if (sub.includes("home") || sub.includes("zuhause")) type = "HOME";
    else if (sub.includes("work") || sub.includes("arbeit")) type = "WORK";
    lines.push(`ADR;TYPE=${type}:${adr}`);
  }

  // Geburtstag aus important_dates (Label „Geburtstag*").
  const bday = (person.important_dates ?? []).find((d) =>
    d?.label?.toLowerCase().includes("geburtstag"),
  );
  if (bday?.date && /^\d{4}-\d{2}-\d{2}$/.test(bday.date)) {
    lines.push(`BDAY:${bday.date}`);
  }

  lines.push("END:VCARD");
  return lines.join("\r\n");
}
