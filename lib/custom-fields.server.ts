import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import {
  parseFieldDefs,
  newFieldId,
  type CustomFieldDef,
  type CustomFieldType,
} from "@/lib/custom-fields";

// Server-side management of per-user custom field DEFINITIONS, stored on
// profiles.custom_field_defs. Values (per person) are written by the
// person edit action, not here.

export async function getFieldDefs(): Promise<CustomFieldDef[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("profiles")
    .select("custom_field_defs")
    .eq("id", user.id)
    .maybeSingle();
  return parseFieldDefs(data?.custom_field_defs);
}

async function writeFieldDefs(defs: CustomFieldDef[]): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const { error } = await supabase
    .from("profiles")
    .update({ custom_field_defs: defs })
    .eq("id", user.id);
  if (error) throw new Error(`custom_field_defs update: ${error.message}`);
}

export async function addFieldDef(input: {
  label: string;
  type: CustomFieldType;
  options?: string[];
}): Promise<CustomFieldDef> {
  const label = input.label.trim();
  if (!label) throw new Error("Label fehlt");
  const defs = await getFieldDefs();
  const def: CustomFieldDef = {
    id: newFieldId(randomUUID()),
    label,
    type: input.type,
  };
  if (input.type === "dropdown") {
    def.options = (input.options ?? [])
      .map((o) => o.trim())
      .filter(Boolean);
  }
  await writeFieldDefs([...defs, def]);
  return def;
}

export async function updateFieldDef(
  id: string,
  patch: { label?: string; options?: string[] },
): Promise<void> {
  const defs = await getFieldDefs();
  const next = defs.map((d) => {
    if (d.id !== id) return d;
    const updated: CustomFieldDef = { ...d };
    if (patch.label !== undefined) updated.label = patch.label.trim() || d.label;
    if (patch.options !== undefined && d.type === "dropdown") {
      updated.options = patch.options.map((o) => o.trim()).filter(Boolean);
    }
    return updated;
  });
  await writeFieldDefs(next);
}

// Deletes a definition. NOTE: per-person values keyed by this id are left
// orphaned in people.custom_field_values — harmless (ignored at render
// since the def is gone) and cheap. A future FK migration would cascade.
export async function deleteFieldDef(id: string): Promise<void> {
  const defs = await getFieldDefs();
  await writeFieldDefs(defs.filter((d) => d.id !== id));
}
