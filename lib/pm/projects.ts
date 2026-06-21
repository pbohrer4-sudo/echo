import { createClient } from "@/lib/supabase/server";
import { getOrCreateWorkspace } from "./workspace";
import { resolveAiEnabled } from "./types";
import type { PmDocument, PmProject, PmTask } from "./types";

export async function listProjects(
  departmentId: string,
): Promise<PmProject[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_projects")
    .select("*")
    .eq("department_id", departmentId)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });
  return (data ?? []) as PmProject[];
}

export async function getProject(id: string): Promise<PmProject | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_projects")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as PmProject) ?? null;
}

// id → project map for label/colour lookups in lists.
export async function getProjectMap(
  workspaceId: string,
): Promise<Record<string, PmProject>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_projects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  const map: Record<string, PmProject> = {};
  for (const p of (data ?? []) as PmProject[]) map[p.id] = p;
  return map;
}

// Effective AI state for a task: task.ai_mode → project.ai_mode →
// workspace.ai_enabled.
export async function isAiEnabledForTask(task: PmTask): Promise<boolean> {
  const ws = await getOrCreateWorkspace();
  let projectMode = null as PmProject["ai_mode"] | null;
  if (task.project_id) {
    const project = await getProject(task.project_id);
    projectMode = project?.ai_mode ?? null;
  }
  return resolveAiEnabled(task.ai_mode, projectMode, ws.ai_enabled);
}

// Effective AI state for a document, same override chain.
export async function isAiEnabledForDocument(
  doc: Pick<PmDocument, "ai_mode" | "project_id">,
): Promise<boolean> {
  const ws = await getOrCreateWorkspace();
  let projectMode = null as PmProject["ai_mode"] | null;
  if (doc.project_id) {
    const project = await getProject(doc.project_id);
    projectMode = project?.ai_mode ?? null;
  }
  return resolveAiEnabled(doc.ai_mode, projectMode, ws.ai_enabled);
}
