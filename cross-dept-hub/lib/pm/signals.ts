import { createClient } from "@/lib/supabase/server";
import { notify } from "./notifications";
import { getTask } from "./tasks";
import { isActiveStatus, isCompletedStatus, STATUS_GROUP } from "./types";
import type { PmTask } from "./types";

// Wrike-Bot-style signal engine. Wrike's bot @mentions you when a task
// assigned to you becomes ready to begin (all immediate predecessors are
// completed) and when all subtasks of your task are completed, deferred or
// cancelled. We fire the equivalent notifications synchronously on the
// status change instead of hourly polling. All best-effort.

interface WorkspaceMemberRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
}

async function membersOf(workspaceId: string): Promise<WorkspaceMemberRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_workspace_members")
    .select("user_id, email, display_name")
    .eq("workspace_id", workspaceId);
  return (data ?? []) as WorkspaceMemberRow[];
}

// Notify a single user that they were assigned to a task. Skips
// self-assignment (you know what you just did).
export async function notifyAssigned(
  task: Pick<PmTask, "id" | "workspace_id" | "title" | "owner_department_id">,
  assigneeId: string,
  actorId: string | null,
  link: string,
): Promise<void> {
  if (!assigneeId || assigneeId === actorId) return;
  const members = await membersOf(task.workspace_id);
  const member = members.find((m) => m.user_id === assigneeId);
  if (!member) return;
  await notify({
    workspaceId: task.workspace_id,
    recipients: [{ user_id: member.user_id, email: member.email }],
    type: "assigned",
    title: `Dir zugewiesen: ${task.title}`,
    link,
    taskId: task.id,
  });
}

// Match @mentions in a comment against workspace member display names.
// "@Patrick" or "@Patrick Bohrer" — longest display-name match wins, case
// insensitive. Returns the matched user ids (excluding the author).
export function extractMentions(
  body: string,
  members: { user_id: string; display_name: string | null }[],
  authorId: string | null,
): string[] {
  const lower = body.toLowerCase();
  const hits: string[] = [];
  for (const m of members) {
    if (!m.display_name || m.user_id === authorId) continue;
    if (lower.includes(`@${m.display_name.toLowerCase()}`)) {
      hits.push(m.user_id);
    }
  }
  return hits;
}

export async function notifyMentions(
  task: Pick<PmTask, "id" | "workspace_id" | "title">,
  body: string,
  authorId: string | null,
  link: string,
): Promise<string[]> {
  const members = await membersOf(task.workspace_id);
  const mentioned = extractMentions(body, members, authorId);
  if (mentioned.length === 0) return [];
  const recipients = members
    .filter((m) => mentioned.includes(m.user_id))
    .map((m) => ({ user_id: m.user_id, email: m.email }));
  await notify({
    workspaceId: task.workspace_id,
    recipients,
    type: "mention",
    title: `Du wurdest erwähnt: ${task.title}`,
    body,
    link,
    taskId: task.id,
  });
  return mentioned;
}

// Runs after a task enters the Completed group. Two Wrike-Bot signals:
//   1. Successors whose predecessors are now ALL completed → notify their
//      assignee the task is ready to start (FS/SS gates; FF/SF don't gate
//      a start, so they're informational only and skipped here).
//   2. If this was a subtask and all siblings are now in a non-active
//      group → notify the parent's assignee for review.
export async function runCompletionSignals(taskId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task || !isCompletedStatus(task.status)) return;
  const supabase = await createClient();

  try {
    // --- 1. Ready-to-start for successors -------------------------------
    const { data: successorEdges } = await supabase
      .from("pm_task_dependencies")
      .select("task_id, dependency_type")
      .eq("depends_on_task_id", taskId)
      .in("dependency_type", ["FS", "SS"]);

    for (const edge of successorEdges ?? []) {
      const successor = await getTask(edge.task_id);
      if (!successor || !isActiveStatus(successor.status)) continue;

      // All of the successor's start-gating predecessors done?
      const { data: predEdges } = await supabase
        .from("pm_task_dependencies")
        .select("depends_on_task_id, dependency_type")
        .eq("task_id", successor.id)
        .in("dependency_type", ["FS", "SS"]);
      const predIds = (predEdges ?? []).map((p) => p.depends_on_task_id);
      if (predIds.length === 0) continue;
      const { data: preds } = await supabase
        .from("pm_tasks")
        .select("id, status")
        .in("id", predIds)
        .is("deleted_at", null);
      const allDone = (preds ?? []).every((p) =>
        isCompletedStatus(p.status),
      );
      if (!allDone) continue;

      await addSystemComment(
        supabase,
        successor,
        `Alle Vorgänger sind erledigt - diese Aufgabe kann starten. (Auslöser: "${task.title}")`,
      );
      if (successor.assignee_id) {
        const members = await membersOf(successor.workspace_id);
        const assignee = members.find(
          (m) => m.user_id === successor.assignee_id,
        );
        if (assignee) {
          await notify({
            workspaceId: successor.workspace_id,
            recipients: [
              { user_id: assignee.user_id, email: assignee.email },
            ],
            type: "ready_to_start",
            title: `Startklar: ${successor.title}`,
            body: `Alle Vorgänger sind erledigt.`,
            taskId: successor.id,
          });
        }
      }
    }

    // --- 2. Parent review-ready ------------------------------------------
    if (task.parent_task_id) {
      const parent = await getTask(task.parent_task_id);
      if (parent && isActiveStatus(parent.status)) {
        const { data: siblings } = await supabase
          .from("pm_tasks")
          .select("status")
          .eq("parent_task_id", parent.id)
          .is("deleted_at", null);
        // Wrike counts completed, deferred AND cancelled subtasks as done.
        const allSettled = (siblings ?? []).every(
          (s) => STATUS_GROUP[s.status as PmTask["status"]] !== "active",
        );
        if (allSettled && (siblings ?? []).length > 0) {
          await addSystemComment(
            supabase,
            parent,
            "Alle Unteraufgaben sind abgeschlossen - bereit für Review.",
          );
          if (parent.assignee_id) {
            const members = await membersOf(parent.workspace_id);
            const assignee = members.find(
              (m) => m.user_id === parent.assignee_id,
            );
            if (assignee) {
              await notify({
                workspaceId: parent.workspace_id,
                recipients: [
                  { user_id: assignee.user_id, email: assignee.email },
                ],
                type: "review_ready",
                title: `Bereit für Review: ${parent.title}`,
                body: "Alle Unteraufgaben sind abgeschlossen.",
                taskId: parent.id,
              });
            }
          }
        }
      }
    }
  } catch {
    // Signals are best-effort; the status change itself already succeeded.
  }
}

async function addSystemComment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  task: Pick<PmTask, "id" | "workspace_id">,
  body: string,
): Promise<void> {
  await supabase.from("pm_task_comments").insert({
    task_id: task.id,
    workspace_id: task.workspace_id,
    user_id: null,
    body: `[Hub-Bot] ${body}`,
    is_system: true,
  });
}
