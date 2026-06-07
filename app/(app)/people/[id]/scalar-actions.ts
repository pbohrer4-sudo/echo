"use server";

// Scalar-field update for the in-page "Bearbeiten" toggle on the person
// detail view (2026-06-07). Updates ONLY the scalar bio columns +
// custom_field_values. It deliberately does NOT touch the multi-row
// structures (tags/passions/circles, contacts, geographies, dates,
// relationships, life events) — those already edit inline on the detail
// page via their own controls, and reconciling them here would risk
// wiping data the user didn't submit.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveOrCreateOrganization } from "@/lib/organizations";
import { getFieldDefs } from "@/lib/custom-fields.server";
import { coerceValue, type CustomFieldValues } from "@/lib/custom-fields";

type Result = { ok: true } | { ok: false; error: string };

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function dateOrNull(v: FormDataEntryValue | null): string | null {
  const t = trimOrNull(v);
  if (!t) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function parseSynergies(v: FormDataEntryValue | null): string[] {
  if (typeof v !== "string" || !v.trim()) return [];
  try {
    const arr = JSON.parse(v);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function parseCustomFieldValues(
  v: FormDataEntryValue | null,
): Promise<CustomFieldValues> {
  if (typeof v !== "string" || !v.trim()) return {};
  let parsed: Record<string, unknown>;
  try {
    const j = JSON.parse(v);
    if (!j || typeof j !== "object" || Array.isArray(j)) return {};
    parsed = j as Record<string, unknown>;
  } catch {
    return {};
  }
  const defs = await getFieldDefs();
  const out: CustomFieldValues = {};
  for (const def of defs) {
    const raw = parsed[def.id];
    if (def.type === "checkbox") {
      out[def.id] = raw === true || raw === "true" || raw === "on" || raw === "1";
      continue;
    }
    out[def.id] = coerceValue(def, raw == null ? null : String(raw));
  }
  return out;
}

export async function updatePersonScalars(
  personId: string,
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht angemeldet" };

  const name = trimOrNull(formData.get("name"));
  if (!name) return { ok: false, error: "Name fehlt" };

  // Language stays required (matches the create flow).
  const primaryLanguage = trimOrNull(formData.get("primary_language"));
  if (!primaryLanguage) return { ok: false, error: "Hauptsprache fehlt" };

  const company = trimOrNull(formData.get("company"));
  const organization_id = await resolveOrCreateOrganization(company, user.id);

  const update: Record<string, unknown> = {
    name,
    company,
    organization_id,
    role: trimOrNull(formData.get("role")),
    primary_language: primaryLanguage,
    secondary_language: trimOrNull(formData.get("secondary_language")),
    how_we_met: trimOrNull(formData.get("how_we_met")),
    met_location: trimOrNull(formData.get("met_location")),
    met_date: dateOrNull(formData.get("met_date")),
    introduced_by: trimOrNull(formData.get("introduced_by")),
    met_with: trimOrNull(formData.get("met_with")),
    synergies: parseSynergies(formData.get("synergies")),
    gift_idea: trimOrNull(formData.get("gift_idea")),
    notes: trimOrNull(formData.get("notes")),
    custom_field_values: await parseCustomFieldValues(
      formData.get("custom_field_values"),
    ),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("people")
    .update(update)
    .eq("id", personId)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/people/${personId}`);
  return { ok: true };
}
