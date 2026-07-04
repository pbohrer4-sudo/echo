import { createClient } from "@/lib/supabase/server";
import type { PmTask, PmTaskStatus } from "./types";

// Dashboard aggregation + deterministic risk signals. The risk flag is an
// explicit heuristic (pacing vs. remaining time), NOT an AI prediction — it
// is labeled as such in the UI so nobody mistakes it for a model output.

export interface WorkspaceStats {
  byStatus: Record<PmTaskStatus, number>;
  overdue: number;
  dueThisWeek: number;
  openTotal: number;
  doneLast30: number;
}

export async function listWorkspaceTasks(
  workspaceId: string,
): Promise<PmTask[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .neq("status", "archived");
  return (data ?? []) as PmTask[];
}

export function computeStats(tasks: PmTask[]): WorkspaceStats {
  const byStatus = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    blocked: 0,
    review: 0,
    done: 0,
    archived: 0,
  } as Record<PmTaskStatus, number>;
  let overdue = 0;
  let dueThisWeek = 0;
  let doneLast30 = 0;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAhead = new Date(now.getTime() + 7 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const thirtyAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();

  for (const t of tasks) {
    byStatus[t.status] += 1;
    const open = t.status !== "done" && t.status !== "archived";
    if (open && t.due_date && t.due_date < today) overdue += 1;
    if (open && t.due_date && t.due_date >= today && t.due_date <= weekAhead) {
      dueThisWeek += 1;
    }
    if (t.status === "done" && t.updated_at >= thirtyAgo) doneLast30 += 1;
  }

  const openTotal =
    byStatus.backlog +
    byStatus.todo +
    byStatus.in_progress +
    byStatus.blocked +
    byStatus.review;

  return { byStatus, overdue, dueThisWeek, openTotal, doneLast30 };
}

export interface ProjectRisk {
  projectId: string;
  level: "on_track" | "at_risk" | "overdue";
  reason: string;
  open: number;
  total: number;
}

// Pacing heuristic per project: overdue open tasks → "overdue"; more than
// half the work still open with less than a third of the time to the latest
// due date remaining → "at_risk"; otherwise on track.
export function computeProjectRisks(
  tasks: PmTask[],
): Record<string, ProjectRisk> {
  const byProject = new Map<string, PmTask[]>();
  for (const t of tasks) {
    if (!t.project_id) continue;
    const list = byProject.get(t.project_id) ?? [];
    list.push(t);
    byProject.set(t.project_id, list);
  }

  const today = new Date().toISOString().slice(0, 10);
  const out: Record<string, ProjectRisk> = {};

  for (const [projectId, list] of byProject) {
    const open = list.filter(
      (t) => t.status !== "done" && t.status !== "archived",
    );
    const total = list.length;
    const overdueTasks = open.filter((t) => t.due_date && t.due_date < today);

    if (overdueTasks.length > 0) {
      out[projectId] = {
        projectId,
        level: "overdue",
        reason: `${overdueTasks.length} Aufgabe(n) überfällig`,
        open: open.length,
        total,
      };
      continue;
    }

    const dueDates = list
      .map((t) => t.due_date)
      .filter((d): d is string => Boolean(d))
      .sort();
    const startDates = list
      .map((t) => t.start_date ?? t.created_at.slice(0, 10))
      .sort();

    if (dueDates.length > 0 && open.length / Math.max(total, 1) > 0.5) {
      const start = new Date(startDates[0]).getTime();
      const end = new Date(dueDates[dueDates.length - 1]).getTime();
      const nowMs = Date.now();
      const span = end - start;
      if (span > 0 && (end - nowMs) / span < 1 / 3) {
        out[projectId] = {
          projectId,
          level: "at_risk",
          reason: `${open.length} von ${total} Aufgaben offen, weniger als ein Drittel der Zeit übrig`,
          open: open.length,
          total,
        };
        continue;
      }
    }

    out[projectId] = {
      projectId,
      level: "on_track",
      reason: "Im Plan",
      open: open.length,
      total,
    };
  }

  return out;
}
