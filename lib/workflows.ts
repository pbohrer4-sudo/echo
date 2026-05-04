import { createClient } from "@/lib/supabase/server";
import type { Workflow } from "@/lib/types";

export async function listWorkflows(): Promise<Workflow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Workflow[];
}

export async function getWorkflowById(id: string): Promise<Workflow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as Workflow) ?? null;
}
