"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_STAGES } from "@/lib/pipelines";
import type {
  PipelineEntityType,
  PipelineFieldDef,
  PipelineStage,
} from "@/lib/types";

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function safeParseJson<T>(raw: FormDataEntryValue | null, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function createPipeline(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim() || "Sales-Pipeline";
  const description = trimOrNull(formData.get("description"));
  const entityRaw = String(formData.get("entity_type") ?? "both");
  const entity_type: PipelineEntityType =
    entityRaw === "person" || entityRaw === "organization"
      ? (entityRaw as PipelineEntityType)
      : "both";
  const default_currency =
    String(formData.get("default_currency") ?? "EUR").trim() || "EUR";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("pipelines")
    .insert({
      user_id: user.id,
      name,
      description,
      entity_type,
      default_currency,
      stages: DEFAULT_STAGES,
      field_definitions: [],
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/pipelines/new?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/pipelines");
  redirect(`/pipelines/${data!.id}`);
}

export async function updatePipelineSettings(
  id: string,
  formData: FormData,
) {
  const name = String(formData.get("name") ?? "").trim();
  const description = trimOrNull(formData.get("description"));
  const entityRaw = String(formData.get("entity_type") ?? "both");
  const entity_type: PipelineEntityType =
    entityRaw === "person" || entityRaw === "organization"
      ? (entityRaw as PipelineEntityType)
      : "both";
  const default_currency =
    String(formData.get("default_currency") ?? "EUR").trim() || "EUR";

  const stages = safeParseJson<PipelineStage[]>(formData.get("stages_json"), []);
  const cleanStages = stages
    .filter((s) => s && typeof s.id === "string" && s.id && s.name)
    .map((s, i) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      order: i,
      probability:
        typeof s.probability === "number" ? s.probability : undefined,
      outcome: s.outcome,
    }));

  const fields = safeParseJson<PipelineFieldDef[]>(
    formData.get("fields_json"),
    [],
  );
  const cleanFields = fields
    .filter((f) => f && typeof f.key === "string" && f.key && f.label && f.type)
    .map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      options: f.options ?? undefined,
      required: Boolean(f.required) || undefined,
    }));

  const supabase = await createClient();
  const { error } = await supabase
    .from("pipelines")
    .update({
      name: name || undefined,
      description,
      entity_type,
      default_currency,
      stages: cleanStages,
      field_definitions: cleanFields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    redirect(
      `/pipelines/${id}/settings?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/pipelines");
  revalidatePath(`/pipelines/${id}`);
  redirect(`/pipelines/${id}`);
}

export async function deletePipeline(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pipelines")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/pipelines");
  redirect("/pipelines");
}
