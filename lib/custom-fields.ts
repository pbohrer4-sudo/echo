// Custom fields — hybrid jsonb MVP (2026-06-07).
//
// Field DEFINITIONS live per-user on profiles.custom_field_defs.
// Field VALUES live per-person on people.custom_field_values keyed by def id.
//
// LONG-TERM: migrate to FK tables (see memory echo_custom_fields_and_views).
//
// This module is pure (no server imports) so it's safe in client + server
// bundles. Server reads/writes go through lib/custom-fields.server.ts.

export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "dropdown",
  "checkbox",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text (kurz)",
  textarea: "Text (lang)",
  number: "Zahl",
  date: "Datum",
  dropdown: "Auswahl",
  checkbox: "Ja / Nein",
};

export interface CustomFieldDef {
  id: string;
  label: string;
  type: CustomFieldType;
  // Only meaningful for type === "dropdown".
  options?: string[];
}

// Per-person values: defId → primitive. null = unset.
export type CustomFieldValues = Record<string, string | number | boolean | null>;

function isCustomFieldType(v: unknown): v is CustomFieldType {
  return (
    typeof v === "string" &&
    (CUSTOM_FIELD_TYPES as readonly string[]).includes(v)
  );
}

// Defensive parse of profiles.custom_field_defs (unknown jsonb → typed).
export function parseFieldDefs(raw: unknown): CustomFieldDef[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomFieldDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!id || !label) continue;
    if (!isCustomFieldType(o.type)) continue;
    const def: CustomFieldDef = { id, label, type: o.type };
    if (o.type === "dropdown" && Array.isArray(o.options)) {
      def.options = o.options
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    out.push(def);
  }
  return out;
}

export function parseFieldValues(raw: unknown): CustomFieldValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CustomFieldValues = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    }
  }
  return out;
}

// Coerce a raw form value to the def's type. Returns null when empty.
export function coerceValue(
  def: CustomFieldDef,
  raw: string | null | undefined,
): string | number | boolean | null {
  if (raw == null) return def.type === "checkbox" ? false : null;
  switch (def.type) {
    case "number": {
      const t = raw.trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    }
    case "checkbox":
      return raw === "true" || raw === "on" || raw === "1";
    case "dropdown": {
      const t = raw.trim();
      if (!t) return null;
      // Only accept a value that's still a valid option.
      return def.options?.includes(t) ? t : null;
    }
    case "date":
    case "text":
    case "textarea":
    default: {
      const t = raw.trim();
      return t ? t : null;
    }
  }
}

// Human-readable rendering of a stored value (detail page).
export function displayValue(
  def: CustomFieldDef,
  value: string | number | boolean | null | undefined,
): string {
  if (value == null || value === "") return "—";
  if (def.type === "checkbox") return value ? "Ja" : "Nein";
  if (def.type === "date" && typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("de-DE");
  }
  return String(value);
}

// Generate a stable id for a new field def. Caller passes a uuid (server
// uses crypto.randomUUID); kept here so the client manager can also mint
// ids before saving.
export function newFieldId(uuid: string): string {
  return `cf_${uuid}`;
}
