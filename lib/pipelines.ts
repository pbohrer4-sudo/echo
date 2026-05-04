import { createClient } from "@/lib/supabase/server";
import type { Deal, Pipeline, PipelineStage } from "@/lib/types";

export interface PipelineSummary extends Pipeline {
  deal_count: number;
  open_value: number;
  won_value: number;
}

export async function listPipelines(): Promise<PipelineSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipelines")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const pipelines = (data ?? []) as Pipeline[];
  if (pipelines.length === 0) return [];

  const { data: dealsRows, error: dealsError } = await supabase
    .from("deals")
    .select("pipeline_id, value, status")
    .is("deleted_at", null)
    .in(
      "pipeline_id",
      pipelines.map((p) => p.id),
    );
  if (dealsError) throw dealsError;

  const counts = new Map<string, number>();
  const openSum = new Map<string, number>();
  const wonSum = new Map<string, number>();
  for (const row of (dealsRows ?? []) as {
    pipeline_id: string;
    value: number | null;
    status: string;
  }[]) {
    counts.set(row.pipeline_id, (counts.get(row.pipeline_id) ?? 0) + 1);
    const v = Number(row.value ?? 0);
    if (row.status === "open") {
      openSum.set(row.pipeline_id, (openSum.get(row.pipeline_id) ?? 0) + v);
    } else if (row.status === "won") {
      wonSum.set(row.pipeline_id, (wonSum.get(row.pipeline_id) ?? 0) + v);
    }
  }

  return pipelines.map((p) => ({
    ...p,
    deal_count: counts.get(p.id) ?? 0,
    open_value: openSum.get(p.id) ?? 0,
    won_value: wonSum.get(p.id) ?? 0,
  }));
}

export async function getPipelineById(id: string): Promise<Pipeline | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipelines")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as Pipeline) ?? null;
}

export async function listDealsForPipeline(
  pipelineId: string,
): Promise<Deal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("pipeline_id", pipelineId)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Deal[];
}

export async function getDealById(id: string): Promise<Deal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as Deal) ?? null;
}

// Default 5-stage sales pipeline used as the seed when a user creates
// their first pipeline. Stage IDs are short slugs so they're stable
// across renames.
export const DEFAULT_STAGES: PipelineStage[] = [
  { id: "lead", name: "Lead", order: 0, probability: 10 },
  { id: "qualified", name: "Qualified", order: 1, probability: 30 },
  { id: "proposal", name: "Proposal", order: 2, probability: 50 },
  { id: "negotiation", name: "Negotiation", order: 3, probability: 75 },
  {
    id: "won",
    name: "Closed Won",
    order: 4,
    probability: 100,
    outcome: "won",
  },
  {
    id: "lost",
    name: "Closed Lost",
    order: 5,
    probability: 0,
    outcome: "lost",
  },
];
