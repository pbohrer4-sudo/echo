"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveOrCreateOrganization } from "@/lib/organizations";
import type {
  AddressEntry,
  EmailEntry,
  GeographyEntry,
  ImportantDate,
  PhoneEntry,
  PriorityBucket,
  PriorityLetter,
  RelationshipDepth,
  RelationshipEntry,
  Scope,
  SocialEntry,
} from "@/lib/types";
import {
  PRIORITY_BUCKETS,
  PRIORITY_LETTERS,
  RELATIONSHIP_DEPTHS,
} from "@/lib/types";

const SCOPES: Scope[] = ["work", "personal", "both"];

// Labels where it's safe to auto-mirror the reverse on the other person.
// For asymmetric kinship (Mutter ↔ Sohn/Tochter) we'd need to know
// gender, so those stay manual.
const SYMMETRIC_LABELS = new Set([
  "Partner:in",
  "Ehepartner:in",
  "Freund:in",
  "Kolleg:in",
]);

interface PersonInput {
  name: string;
  company: string | null;
  role: string | null;
  scope: Scope;
  tags: string[];
  expected_cadence_days: number | null;
  birthday: string | null;
  phone: string | null;
  email: string | null;
  phones: PhoneEntry[];
  emails: EmailEntry[];
  addresses: AddressEntry[];
  socials: SocialEntry[];
  important_dates: ImportantDate[];
  relationships: RelationshipEntry[];
  avatar_url: string | null;
  notes: string | null;
  strength_score: number | null;
  // Stakeholder model
  stakeholder_types: string[];
  stakeholder_sub_types: Record<string, string[]>;
  geographies: GeographyEntry[];
  industry: string | null;
  job_function: string | null;
  cta: string | null;
  cta_expires_at: string | null;
  priority: PriorityLetter | null;
  priority_bucket: PriorityBucket | null;
  interests: string[];
  depth_override: RelationshipDepth | null;
}

function parseFormData(formData: FormData): PersonInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name ist Pflicht" };

  const scopeRaw = String(formData.get("scope") ?? "both");
  const scope: Scope = (SCOPES as string[]).includes(scopeRaw)
    ? (scopeRaw as Scope)
    : "both";

  const tagsRaw = String(formData.get("tags") ?? "");
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const cadenceRaw = String(formData.get("expected_cadence_days") ?? "");
  const expected_cadence_days = cadenceRaw ? parseInt(cadenceRaw, 10) : null;
  if (cadenceRaw && Number.isNaN(expected_cadence_days)) {
    return { error: "Cadence muss eine Zahl sein" };
  }

  const trimOrNull = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v ? v : null;
  };

  const strengthRaw = String(formData.get("strength_score") ?? "");
  const strengthParsed = strengthRaw ? parseInt(strengthRaw, 10) : 0;
  const strength_score =
    Number.isNaN(strengthParsed) || strengthParsed === 0
      ? null
      : Math.max(0, Math.min(5, strengthParsed));

  const phones = parsePhones(formData.get("phones"));
  const emails = parseEmails(formData.get("emails"));
  const addresses = parseAddresses(formData.get("addresses"));
  const socials = parseSocials(formData.get("socials"));
  const important_dates = parseDates(formData.get("important_dates"));
  const relationships = parseRelationships(formData.get("relationships"));

  const stakeholder_types = parseStringArray(formData.get("stakeholder_types"));
  const stakeholder_sub_types = parseSubTypes(
    formData.get("stakeholder_sub_types"),
  );
  const geographies = parseGeographies(formData.get("geographies"));
  const interests = parseStringArray(formData.get("interests"));

  const priorityRaw = String(formData.get("priority") ?? "");
  const priority = (PRIORITY_LETTERS as readonly string[]).includes(priorityRaw)
    ? (priorityRaw as PriorityLetter)
    : null;

  const bucketRaw = String(formData.get("priority_bucket") ?? "");
  const priority_bucket = (PRIORITY_BUCKETS as readonly string[]).includes(
    bucketRaw,
  )
    ? (bucketRaw as PriorityBucket)
    : null;

  const depthRaw = String(formData.get("depth_override") ?? "");
  const depth_override = (RELATIONSHIP_DEPTHS as readonly string[]).includes(
    depthRaw,
  )
    ? (depthRaw as RelationshipDepth)
    : null;

  const ctaExpiresRaw = String(formData.get("cta_expires_at") ?? "").trim();
  const cta_expires_at = ctaExpiresRaw
    ? new Date(ctaExpiresRaw).toISOString()
    : null;

  // Mirror the primary phone / email / first birthday into the legacy
  // single columns so voice-extraction code paths and Sunday-Pulse
  // queries keep working.
  const primaryPhone = phones[0]?.value ?? null;
  const primaryEmail = emails[0]?.value ?? null;
  const birthdayEntry = important_dates.find(
    (d) => d.label.toLowerCase() === "geburtstag",
  );
  const birthday = birthdayEntry?.date ?? null;

  return {
    name,
    company: trimOrNull("company"),
    role: trimOrNull("role"),
    scope,
    tags,
    expected_cadence_days,
    birthday,
    phone: primaryPhone,
    email: primaryEmail,
    phones,
    emails,
    addresses,
    socials,
    important_dates,
    relationships,
    avatar_url: trimOrNull("avatar_url"),
    notes: (formData.get("notes_field") as string)?.trim() || null,
    strength_score,
    stakeholder_types,
    stakeholder_sub_types,
    geographies,
    industry: trimOrNull("industry"),
    job_function: trimOrNull("job_function"),
    cta: trimOrNull("cta"),
    cta_expires_at,
    priority,
    priority_bucket,
    interests,
    depth_override,
  };
}

// Append-mode helper for parsing JSON-encoded arrays in hidden form
// fields. Defensive against malformed input — returns [] on any
// parse error.
function safeParseArray(raw: FormDataEntryValue | null): unknown[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function parseStringArray(raw: FormDataEntryValue | null): string[] {
  return safeParseArray(raw)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function parseSubTypes(
  raw: FormDataEntryValue | null,
): Record<string, string[]> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return {};
    const result: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        result[key] = value
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
      }
    }
    return result;
  } catch {
    return {};
  }
}

function parseGeographies(raw: FormDataEntryValue | null): GeographyEntry[] {
  const rows = safeParseArray(raw);
  const result: GeographyEntry[] = [];
  for (const e of rows) {
    if (!e || typeof e !== "object") continue;
    const obj = e as Record<string, unknown>;
    const place = typeof obj.place === "string" ? obj.place.trim() : "";
    if (!place) continue;
    result.push({
      kind:
        typeof obj.kind === "string" && obj.kind.trim()
          ? obj.kind.trim()
          : "Wohnort",
      place,
      since: typeof obj.since === "string" && obj.since ? obj.since : null,
      until: typeof obj.until === "string" && obj.until ? obj.until : null,
    });
  }
  return result;
}

export async function createPerson(formData: FormData) {
  const parsed = parseFormData(formData);
  if ("error" in parsed) {
    redirect(`/people/new?error=${encodeURIComponent(parsed.error)}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const organization_id = await resolveOrCreateOrganization(
    parsed.company,
    user.id,
  );

  // priority_set_at gets stamped only when the bucket is set on
  // creation — it anchors the decay clock.
  const priority_set_at = parsed.priority_bucket
    ? new Date().toISOString()
    : null;

  const { data, error } = await supabase
    .from("people")
    .insert({
      ...parsed,
      organization_id,
      user_id: user.id,
      priority_set_at,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/people/new?error=${encodeURIComponent(error.message)}`);
  }

  await syncSymmetricRelationships(data!.id, parsed.relationships);

  revalidatePath("/people");
  redirect(`/people/${data!.id}`);
}

export async function updatePerson(id: string, formData: FormData) {
  const parsed = parseFormData(formData);
  if ("error" in parsed) {
    redirect(`/people/${id}/edit?error=${encodeURIComponent(parsed.error)}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const organization_id = await resolveOrCreateOrganization(
    parsed.company,
    user.id,
  );

  // Re-stamp priority_set_at only when the bucket actually changed.
  // Reading the existing row is one extra query but keeps the decay
  // clock honest — without this, every save would reset the bucket
  // to "this-week".
  const { data: existing } = await supabase
    .from("people")
    .select("priority_bucket, priority_set_at")
    .eq("id", id)
    .maybeSingle();

  let priority_set_at = existing?.priority_set_at ?? null;
  if (parsed.priority_bucket !== existing?.priority_bucket) {
    priority_set_at = parsed.priority_bucket
      ? new Date().toISOString()
      : null;
  }

  const { error } = await supabase
    .from("people")
    .update({ ...parsed, organization_id, priority_set_at })
    .eq("id", id);

  if (error) {
    redirect(`/people/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  await syncSymmetricRelationships(id, parsed.relationships);

  revalidatePath("/people");
  revalidatePath(`/people/${id}`);
  redirect(`/people/${id}`);
}

// For each symmetric relationship pointing at another person, make
// sure the other person has the inverse pointing back. Idempotent —
// no-op when the inverse already exists. Asymmetric labels (Mutter,
// Sohn, etc.) are left to the user to maintain.
async function syncSymmetricRelationships(
  personId: string,
  relationships: RelationshipEntry[],
) {
  const symmetric = relationships.filter((r) =>
    SYMMETRIC_LABELS.has(r.label),
  );
  if (symmetric.length === 0) return;

  const supabase = await createClient();
  const otherIds = Array.from(
    new Set(symmetric.map((r) => r.related_person_id)),
  );

  const { data: others, error } = await supabase
    .from("people")
    .select("id, relationships")
    .in("id", otherIds);
  if (error || !others) return;

  for (const other of others as Array<{
    id: string;
    relationships: RelationshipEntry[] | null;
  }>) {
    const existing = other.relationships ?? [];
    const needed = symmetric.filter(
      (r) => r.related_person_id === other.id,
    );
    let changed = false;
    const next = [...existing];
    for (const r of needed) {
      const alreadyThere = existing.some(
        (e) => e.related_person_id === personId && e.label === r.label,
      );
      if (!alreadyThere) {
        next.push({ related_person_id: personId, label: r.label });
        changed = true;
      }
    }
    if (changed) {
      await supabase
        .from("people")
        .update({ relationships: next })
        .eq("id", other.id);
      revalidatePath(`/people/${other.id}`);
    }
  }
}

export async function deletePerson(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    redirect(`/people/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/people");
  redirect("/people");
}

// ---------- JSON parsing helpers ----------
// Each helper takes the raw FormData value (string | File | null), parses
// it as JSON, then validates each entry's shape. Anything that doesn't
// match is silently dropped; we never throw, so a malformed array
// won't 500 the form submit.

function safeJson(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parsePhones(raw: FormDataEntryValue | null): PhoneEntry[] {
  const data = safeJson(raw);
  if (!Array.isArray(data)) return [];
  return data
    .map((e: unknown) => {
      if (typeof e !== "object" || !e) return null;
      const obj = e as Record<string, unknown>;
      const value = asString(obj.value);
      if (!value) return null;
      return { label: asString(obj.label) || "mobile", value };
    })
    .filter((e): e is PhoneEntry => e !== null);
}

function parseEmails(raw: FormDataEntryValue | null): EmailEntry[] {
  const data = safeJson(raw);
  if (!Array.isArray(data)) return [];
  return data
    .map((e: unknown) => {
      if (typeof e !== "object" || !e) return null;
      const obj = e as Record<string, unknown>;
      const value = asString(obj.value);
      if (!value) return null;
      return { label: asString(obj.label) || "persönlich", value };
    })
    .filter((e): e is EmailEntry => e !== null);
}

function parseAddresses(raw: FormDataEntryValue | null): AddressEntry[] {
  const data = safeJson(raw);
  if (!Array.isArray(data)) return [];
  return data
    .map((e: unknown) => {
      if (typeof e !== "object" || !e) return null;
      const obj = e as Record<string, unknown>;
      const street = asString(obj.street);
      const city = asString(obj.city);
      if (!street && !city) return null;
      return {
        label: asString(obj.label) || "zuhause",
        street: street || null,
        city: city || null,
        postal_code: asString(obj.postal_code) || null,
        country: asString(obj.country) || null,
      };
    })
    .filter((e): e is AddressEntry => e !== null);
}

function parseSocials(raw: FormDataEntryValue | null): SocialEntry[] {
  const data = safeJson(raw);
  if (!Array.isArray(data)) return [];
  return data
    .map((e: unknown) => {
      if (typeof e !== "object" || !e) return null;
      const obj = e as Record<string, unknown>;
      const handle = asString(obj.handle_or_url);
      if (!handle) return null;
      return {
        platform: asString(obj.platform) || "andere",
        handle_or_url: handle,
      };
    })
    .filter((e): e is SocialEntry => e !== null);
}

function parseDates(raw: FormDataEntryValue | null): ImportantDate[] {
  const data = safeJson(raw);
  if (!Array.isArray(data)) return [];
  return data
    .map((e: unknown): ImportantDate | null => {
      if (typeof e !== "object" || !e) return null;
      const obj = e as Record<string, unknown>;
      const date = asString(obj.date);
      if (!date) return null;
      const remind = Boolean(obj.remind);
      const leadRaw = obj.remind_lead_days;
      let lead = 0;
      if (typeof leadRaw === "number" && Number.isFinite(leadRaw)) {
        lead = Math.max(0, Math.min(365, Math.floor(leadRaw)));
      }
      return {
        label: asString(obj.label) || "andere",
        date,
        remind,
        remind_lead_days: remind ? lead : 0,
      };
    })
    .filter((e): e is ImportantDate => e !== null);
}

function parseRelationships(
  raw: FormDataEntryValue | null,
): RelationshipEntry[] {
  const data = safeJson(raw);
  if (!Array.isArray(data)) return [];
  return data
    .map((e: unknown) => {
      if (typeof e !== "object" || !e) return null;
      const obj = e as Record<string, unknown>;
      const id = asString(obj.related_person_id);
      if (!id) return null;
      return {
        related_person_id: id,
        label: asString(obj.label) || "andere",
      };
    })
    .filter((e): e is RelationshipEntry => e !== null);
}
