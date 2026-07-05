import { createClient } from "@/lib/supabase/server";
import { isActiveStatus } from "./types";
import type {
  PmDependencyType,
  PmTask,
  PmTaskBriefing,
  PmTaskComment,
  PmTaskReminder,
  PmTaskStatus,
} from "./types";

interface ListOptions {
  includeArchived?: boolean;
}

// Internal board tasks owned by a department (excludes cross-department
// requests — those live in the inbox view).
export async function listBoardTasks(
  departmentId: string,
  opts: ListOptions = {},
): Promise<PmTask[]> {
  const supabase = await createClient();
  let query = supabase
    .from("pm_tasks")
    .select("*")
    .eq("owner_department_id", departmentId)
    .eq("source", "internal")
    .is("deleted_at", null);
  if (!opts.includeArchived) query = query.neq("status", "archived");
  const { data } = await query
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });
  return (data ?? []) as PmTask[];
}

// Cross-department requests that landed in this department's inbox (work
// other teams asked this department to do).
export async function listIncomingRequests(
  departmentId: string,
): Promise<PmTask[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_tasks")
    .select("*")
    .eq("owner_department_id", departmentId)
    .eq("source", "cross_dept")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as PmTask[];
}

// Cross-department requests this department sent to others (outgoing
// tasks — what other teams owe this department).
export async function listOutgoingRequests(
  departmentId: string,
): Promise<PmTask[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_tasks")
    .select("*")
    .eq("requester_department_id", departmentId)
    .eq("source", "cross_dept")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as PmTask[];
}

export async function getTask(id: string): Promise<PmTask | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_tasks")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as PmTask) ?? null;
}

export async function getLatestBriefing(
  taskId: string,
): Promise<PmTaskBriefing | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_task_briefings")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PmTaskBriefing) ?? null;
}

export async function listComments(taskId: string): Promise<PmTaskComment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_task_comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  return (data ?? []) as PmTaskComment[];
}

export async function listReminders(taskId: string): Promise<PmTaskReminder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_task_reminders")
    .select("*")
    .eq("task_id", taskId)
    .order("remind_at", { ascending: true });
  return (data ?? []) as PmTaskReminder[];
}

export interface DependencyWithTask {
  task: PmTask;
  type: PmDependencyType;
}

// Tasks this one depends on (blockers), resolved to full rows + type.
export async function listDependencies(
  taskId: string,
): Promise<DependencyWithTask[]> {
  const supabase = await createClient();
  const { data: deps } = await supabase
    .from("pm_task_dependencies")
    .select("depends_on_task_id, dependency_type")
    .eq("task_id", taskId);
  if (!deps || deps.length === 0) return [];
  const typeOf = new Map(
    deps.map((d) => [d.depends_on_task_id, d.dependency_type]),
  );
  const { data } = await supabase
    .from("pm_tasks")
    .select("*")
    .in("id", Array.from(typeOf.keys()))
    .is("deleted_at", null);
  return ((data ?? []) as PmTask[]).map((task) => ({
    task,
    type: (typeOf.get(task.id) ?? "FS") as PmDependencyType,
  }));
}

// Count of unfinished incoming requests — drives the inbox badge. "Open"
// means the Active status group (Wrike: Completed / Deferred / Cancelled
// drop out of to-do counts).
export async function countOpenIncoming(departmentId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("pm_tasks")
    .select("id", { count: "exact", head: true })
    .eq("owner_department_id", departmentId)
    .eq("source", "cross_dept")
    .is("deleted_at", null)
    .not("status", "in", "(done,archived,deferred,cancelled)");
  return count ?? 0;
}

export function isOpenStatus(status: PmTaskStatus): boolean {
  return isActiveStatus(status);
}

// All active tasks assigned to the signed-in user, across every department
// (Wrike "My to-do"). Sorted by due date, undated last.
export async function listMyTasks(workspaceId: string): Promise<PmTask[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("pm_tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("assignee_id", user.id)
    .is("deleted_at", null)
    .not("status", "in", "(done,archived,deferred,cancelled)")
    .order("due_date", { ascending: true, nullsFirst: false });
  return (data ?? []) as PmTask[];
}

// Tasks the signed-in user created (Wrike "Created by me").
export async function listCreatedByMe(workspaceId: string): Promise<PmTask[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("pm_tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("created_by", user.id)
    .is("deleted_at", null)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as PmTask[];
}

export interface StreamEntry {
  comment: PmTaskComment;
  task: PmTask;
}

// Workspace-wide activity stream: the latest comments (human + system)
// joined with their tasks (Wrike "Stream").
export async function listStream(
  workspaceId: string,
  limit = 40,
): Promise<StreamEntry[]> {
  const supabase = await createClient();
  const { data: comments } = await supabase
    .from("pm_task_comments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (comments ?? []) as PmTaskComment[];
  if (rows.length === 0) return [];
  const taskIds = Array.from(new Set(rows.map((c) => c.task_id)));
  const { data: tasks } = await supabase
    .from("pm_tasks")
    .select("*")
    .in("id", taskIds)
    .is("deleted_at", null);
  const taskMap = new Map(((tasks ?? []) as PmTask[]).map((t) => [t.id, t]));
  return rows
    .map((comment) => {
      const task = taskMap.get(comment.task_id);
      return task ? { comment, task } : null;
    })
    .filter((e): e is StreamEntry => e !== null);
}
