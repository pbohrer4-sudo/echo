"use server";

import { revalidatePath } from "next/cache";
import {
  addFieldDef,
  deleteFieldDef,
  updateFieldDef,
} from "@/lib/custom-fields.server";
import { CUSTOM_FIELD_TYPES, type CustomFieldType } from "@/lib/custom-fields";

type Result = { ok: true } | { ok: false; error: string };

function parseType(raw: FormDataEntryValue | null): CustomFieldType | null {
  return typeof raw === "string" &&
    (CUSTOM_FIELD_TYPES as readonly string[]).includes(raw)
    ? (raw as CustomFieldType)
    : null;
}

// options arrive as a newline- or comma-separated string from the form.
function parseOptions(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[\n,]/)
    .map((o) => o.trim())
    .filter(Boolean);
}

export async function createCustomField(formData: FormData): Promise<Result> {
  const label = String(formData.get("label") ?? "").trim();
  const type = parseType(formData.get("type"));
  if (!label) return { ok: false, error: "Label fehlt" };
  if (!type) return { ok: false, error: "Ungültiger Feldtyp" };
  try {
    await addFieldDef({
      label,
      type,
      options: type === "dropdown" ? parseOptions(formData.get("options")) : undefined,
    });
    revalidatePath("/settings/custom-fields");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fehler" };
  }
}

export async function editCustomField(formData: FormData): Promise<Result> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Feld-ID fehlt" };
  const label = String(formData.get("label") ?? "").trim();
  try {
    await updateFieldDef(id, {
      label: label || undefined,
      options: formData.has("options")
        ? parseOptions(formData.get("options"))
        : undefined,
    });
    revalidatePath("/settings/custom-fields");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fehler" };
  }
}

export async function removeCustomField(formData: FormData): Promise<Result> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Feld-ID fehlt" };
  try {
    await deleteFieldDef(id);
    revalidatePath("/settings/custom-fields");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fehler" };
  }
}
