// Shared parsers for the JSONB multi-value fields on `people`.
// Used by the voice-extract commit, the people server actions, and the
// business-card scan path. Three independent copies drifted on label
// defaults; centralising them keeps "leerer Eintrag fällt raus" rules
// consistent across every write path.

export interface PhoneEntry {
  label: string;
  value: string;
}

export interface EmailEntry {
  label: string;
  value: string;
}

export interface AddressEntry {
  label: string;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface SocialEntry {
  platform: string;
  handle_or_url: string;
}

export interface ImportantDate {
  label: string;
  date: string;
  remind: boolean;
}

export function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

export function stringOr(v: unknown, fallback: string): string {
  return stringOrNull(v) ?? fallback;
}

export function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
}

export function parsePhones(v: unknown): PhoneEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const obj = e as Record<string, unknown>;
      const value = stringOrNull(obj.value);
      if (!value) return null;
      return { label: stringOr(obj.label, "mobile"), value };
    })
    .filter((e): e is PhoneEntry => e !== null);
}

export function parseEmails(v: unknown): EmailEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const obj = e as Record<string, unknown>;
      const value = stringOrNull(obj.value);
      if (!value) return null;
      return { label: stringOr(obj.label, "persönlich"), value };
    })
    .filter((e): e is EmailEntry => e !== null);
}

export function parseAddresses(v: unknown): AddressEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const obj = e as Record<string, unknown>;
      const street = stringOrNull(obj.street);
      const city = stringOrNull(obj.city);
      if (!street && !city) return null;
      return {
        label: stringOr(obj.label, "zuhause"),
        street,
        city,
        postal_code: stringOrNull(obj.postal_code),
        country: stringOrNull(obj.country),
      };
    })
    .filter((e): e is AddressEntry => e !== null);
}

export function parseSocials(v: unknown): SocialEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const obj = e as Record<string, unknown>;
      const handle = stringOrNull(obj.handle_or_url);
      if (!handle) return null;
      return {
        platform: stringOr(obj.platform, "andere"),
        handle_or_url: handle,
      };
    })
    .filter((e): e is SocialEntry => e !== null);
}

export function parseImportantDates(v: unknown): ImportantDate[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const obj = e as Record<string, unknown>;
      const date = stringOrNull(obj.date);
      if (!date) return null;
      return {
        label: stringOr(obj.label, "andere"),
        date,
        remind: Boolean(obj.remind),
      };
    })
    .filter((e): e is ImportantDate => e !== null);
}

export function findBirthday(v: unknown): string | null {
  const dates = parseImportantDates(v);
  const bday = dates.find((d) => d.label.toLowerCase() === "geburtstag");
  return bday?.date ?? null;
}
