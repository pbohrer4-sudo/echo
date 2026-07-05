import { createClient } from "@/lib/supabase/server";
import { listWorkspaceMembers } from "./workspace";
import { isActiveStatus } from "./types";
import type { PmTask, PmTimeEntry } from "./types";

// Resource management: workload aggregation + timesheets.

// --- Timesheets ---------------------------------------------------------------

export async function listTimeEntries(taskId: string): Promise<PmTimeEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_time_entries")
    .select("*")
    .eq("task_id", taskId)
    .order("entry_date", { ascending: false });
  return (data ?? []) as PmTimeEntry[];
}

export function sumHours(entries: PmTimeEntry[]): number {
  return entries.reduce((acc, e) => acc + Number(e.hours), 0);
}

// Logged hours per task, for list views ("4h / 16h geschätzt").
export async function loggedHoursByTask(
  taskIds: string[],
): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_time_entries")
    .select("task_id, hours")
    .in("task_id", taskIds);
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    out[row.task_id] = (out[row.task_id] ?? 0) + Number(row.hours);
  }
  return out;
}

// --- Workload -------------------------------------------------------------------

export interface MemberWorkload {
  user_id: string | null; // null = unassigned bucket
  display_name: string;
  open_tasks: number;
  estimated_hours: number;
  logged_hours: number;
}

// Aggregate open work per assignee for one department. Tasks without an
// assignee land in an explicit "Nicht zugewiesen" bucket so unplanned work
// stays visible instead of disappearing from the chart.
export async function departmentWorkload(
  workspaceId: string,
  tasks: PmTask[],
): Promise<MemberWorkload[]> {
  const members = await listWorkspaceMembers(workspaceId);
  const nameOf = new Map(
    members.map((m) => [m.user_id, m.display_name || m.user_id.slice(0, 8)]),
  );

  // "Open" = Active status group (deferred/cancelled drop out, like Wrike).
  const open = tasks.filter((t) => isActiveStatus(t.status));
  const logged = await loggedHoursByTask(open.map((t) => t.id));

  const buckets = new Map<string, MemberWorkload>();
  for (const t of open) {
    const key = t.assignee_id ?? "__unassigned__";
    const bucket = buckets.get(key) ?? {
      user_id: t.assignee_id,
      display_name: t.assignee_id
        ? (nameOf.get(t.assignee_id) ?? t.assignee_id.slice(0, 8))
        : "Nicht zugewiesen",
      open_tasks: 0,
      estimated_hours: 0,
      logged_hours: 0,
    };
    bucket.open_tasks += 1;
    bucket.estimated_hours += Number(t.effort_estimate_hours ?? 0);
    bucket.logged_hours += logged[t.id] ?? 0;
    buckets.set(key, bucket);
  }

  // Members with zero open tasks still show up (free capacity is signal too).
  for (const m of members) {
    if (!buckets.has(m.user_id)) {
      buckets.set(m.user_id, {
        user_id: m.user_id,
        display_name: m.display_name || m.user_id.slice(0, 8),
        open_tasks: 0,
        estimated_hours: 0,
        logged_hours: 0,
      });
    }
  }

  return Array.from(buckets.values()).sort(
    (a, b) => b.estimated_hours - a.estimated_hours,
  );
}
