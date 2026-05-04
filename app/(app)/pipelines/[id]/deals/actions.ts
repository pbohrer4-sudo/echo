"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DealStatus } from "@/lib/types";

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function numberOrNull(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeParseJson<T>(raw: FormDataEntryValue | null, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface ParsedDeal {
  title: string;
  stage_id: string;
  person_id: string | null;
  organization_id: string | null;
  value: number | null;
  currency: string | null;
  expected_close_date: string | null;
  probability: number | null;
  status: DealStatus;
  field_values: Record<string, unknown>;
  notes: string | null;
}

function parseDealForm(formData: FormData): ParsedDeal | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Titel ist Pflicht" };
  const stage_id = String(formData.get("stage_id") ?? "").trim();
  if (!stage_id) return { error: "Stage ist Pflicht" };

  const statusRaw = String(formData.get("status") ?? "open");
  const status: DealStatus =
    statusRaw === "open" || statusRaw === "won" || statusRaw === "lost"
      ? (statusRaw as DealStatus)
      : "open";

  return {
    title,
    stage_id,
    person_id: trimOrNull(formData.get("person_id")),
    organization_id: trimOrNull(formData.get("organization_id")),
    value: numberOrNull(formData.get("value")),
    currency: trimOrNull(formData.get("currency")),
    expected_close_date: trimOrNull(formData.get("expected_close_date")),
    probability: numberOrNull(formData.get("probability")),
    status,
    field_values: safeParseJson<Record<string, unknown>>(
      formData.get("field_values_json"),
      {},
    ),
    notes: trimOrNull(formData.get("notes")),
  };
}

export async function createDeal(pipelineId: string, formData: FormData) {
  const parsed = parseDealForm(formData);
  if ("error" in parsed) {
    redirect(
      `/pipelines/${pipelineId}/deals/new?error=${encodeURIComponent(parsed.error)}`,
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("deals")
    .insert({ ...parsed, user_id: user.id, pipeline_id: pipelineId })
    .select("id")
    .single();
  if (error) {
    redirect(
      `/pipelines/${pipelineId}/deals/new?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath(`/pipelines/${pipelineId}`);
  redirect(`/pipelines/${pipelineId}/deals/${data!.id}`);
}

export async function updateDeal(
  pipelineId: string,
  dealId: string,
  formData: FormData,
) {
  const parsed = parseDealForm(formData);
  if ("error" in parsed) {
    redirect(
      `/pipelines/${pipelineId}/deals/${dealId}?error=${encodeURIComponent(parsed.error)}`,
    );
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("deals")
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) {
    redirect(
      `/pipelines/${pipelineId}/deals/${dealId}?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath(`/pipelines/${pipelineId}`);
  revalidatePath(`/pipelines/${pipelineId}/deals/${dealId}`);
  redirect(`/pipelines/${pipelineId}/deals/${dealId}`);
}

// Inline-move from the Kanban — also auto-flips status if the new
// stage has an outcome (won/lost).
export async function moveDealToStage(
  pipelineId: string,
  dealId: string,
  stageId: string,
) {
  const supabase = await createClient();
  // Look up the stage's outcome from the pipeline definition.
  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("stages")
    .eq("id", pipelineId)
    .maybeSingle();
  const stages =
    (pipeline?.stages as { id: string; outcome?: "won" | "lost" }[] | null) ??
    [];
  const target = stages.find((s) => s.id === stageId);
  const status: DealStatus =
    target?.outcome === "won"
      ? "won"
      : target?.outcome === "lost"
        ? "lost"
        : "open";

  const { error } = await supabase
    .from("deals")
    .update({
      stage_id: stageId,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dealId);
  if (error) throw error;

  revalidatePath(`/pipelines/${pipelineId}`);
  revalidatePath(`/pipelines/${pipelineId}/deals/${dealId}`);
}

export async function deleteDeal(pipelineId: string, dealId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("deals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) throw error;
  revalidatePath(`/pipelines/${pipelineId}`);
  redirect(`/pipelines/${pipelineId}`);
}
