"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowStatus,
} from "@/lib/types";

export async function createWorkflow(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim() || "Neuer Workflow";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      user_id: user.id,
      name,
      nodes: [],
      edges: [],
    })
    .select("id")
    .single();
  if (error) {
    redirect(
      `/integrations/workflows?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/integrations/workflows");
  redirect(`/integrations/workflows/${data!.id}`);
}

interface SaveGraphPayload {
  id: string;
  name?: string;
  description?: string | null;
  status?: WorkflowStatus;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export async function saveWorkflowGraph(payload: SaveGraphPayload) {
  const supabase = await createClient();
  const update: Record<string, unknown> = {
    nodes: payload.nodes ?? [],
    edges: payload.edges ?? [],
    updated_at: new Date().toISOString(),
  };
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.description !== undefined) update.description = payload.description;
  if (payload.status !== undefined) update.status = payload.status;

  const { error } = await supabase
    .from("workflows")
    .update(update)
    .eq("id", payload.id);
  if (error) throw error;

  revalidatePath("/integrations/workflows");
  revalidatePath(`/integrations/workflows/${payload.id}`);
}

export async function deleteWorkflow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workflows")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/integrations/workflows");
  redirect("/integrations/workflows");
}
