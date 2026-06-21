import { createClient } from "@/lib/supabase/server";
import type {
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

// Tasks this one depends on (blockers), resolved to full rows.
export async function listDependencies(taskId: string): Promise<PmTask[]> {
  const supabase = await createClient();
  const { data: deps } = await supabase
    .from("pm_task_dependencies")
    .select("depends_on_task_id")
    .eq("task_id", taskId);
  const ids = (deps ?? []).map((d) => d.depends_on_task_id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("pm_tasks")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null);
  return (data ?? []) as PmTask[];
}

// Count of unfinished incoming requests — drives the inbox badge.
export async function countOpenIncoming(departmentId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("pm_tasks")
    .select("id", { count: "exact", head: true })
    .eq("owner_department_id", departmentId)
    .eq("source", "cross_dept")
    .is("deleted_at", null)
    .not("status", "in", "(done,archived)");
  return count ?? 0;
}

export function isOpenStatus(status: PmTaskStatus): boolean {
  return status !== "done" && status !== "archived";
}
