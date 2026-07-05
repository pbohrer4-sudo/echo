import { createClient } from "@/lib/supabase/server";
import { isActiveStatus } from "./types";
import type { PmFolder, PmItemType, PmTask, PmTaskLocation } from "./types";

// Structural reads: folders, custom item types, subtasks, cross-tag
// locations. Everything is workspace-scoped through RLS.

// --- Folders ----------------------------------------------------------------

export async function listFoldersForDepartment(
  departmentId: string,
): Promise<PmFolder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_folders")
    .select("*")
    .eq("department_id", departmentId)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as PmFolder[];
}

export async function getFolderMap(
  workspaceId: string,
): Promise<Record<string, PmFolder>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_folders")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  const map: Record<string, PmFolder> = {};
  for (const f of (data ?? []) as PmFolder[]) map[f.id] = f;
  return map;
}

// --- Custom item types --------------------------------------------------------

export async function listItemTypes(
  workspaceId: string,
): Promise<PmItemType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_item_types")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return (data ?? []) as PmItemType[];
}

export async function getItemType(id: string): Promise<PmItemType | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_item_types")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as PmItemType) ?? null;
}

// --- Subtasks -------------------------------------------------------------------

export async function listSubtasks(parentTaskId: string): Promise<PmTask[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_tasks")
    .select("*")
    .eq("parent_task_id", parentTaskId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return (data ?? []) as PmTask[];
}

// Subtask progress per parent, for list/board badges ("2/5").
export async function subtaskCounts(
  parentIds: string[],
): Promise<Record<string, { done: number; total: number }>> {
  if (parentIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_tasks")
    .select("parent_task_id, status")
    .in("parent_task_id", parentIds)
    .is("deleted_at", null);
  const out: Record<string, { done: number; total: number }> = {};
  for (const row of data ?? []) {
    const pid = row.parent_task_id as string;
    out[pid] = out[pid] ?? { done: 0, total: 0 };
    out[pid].total += 1;
    // Wrike counts completed, deferred and cancelled subtasks as settled.
    if (!isActiveStatus(row.status as PmTask["status"])) out[pid].done += 1;
  }
  return out;
}

// --- Cross-tagging ----------------------------------------------------------------

export async function listTaskLocations(
  taskId: string,
): Promise<PmTaskLocation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_task_locations")
    .select("*")
    .eq("task_id", taskId);
  return (data ?? []) as PmTaskLocation[];
}

// Tasks cross-tagged INTO a department from elsewhere. They appear in this
// department's views alongside its own tasks — same row, no duplication.
export async function listCrossTaggedTasks(
  departmentId: string,
): Promise<PmTask[]> {
  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("pm_task_locations")
    .select("task_id")
    .eq("department_id", departmentId);
  const ids = (locations ?? []).map((l) => l.task_id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("pm_tasks")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null)
    .neq("status", "archived");
  return (data ?? []) as PmTask[];
}
