import { createClient } from "@/lib/supabase/server";
import { notify, resolveDepartmentRecipients } from "./notifications";
import { getTask } from "./tasks";
import { TASK_STATUS_LABEL } from "./types";
import type {
  PmAutomationRule,
  PmBlueprint,
  PmBlueprintPayload,
  PmTaskStatus,
} from "./types";

// --- Automation rules ---------------------------------------------------------

export async function listAutomationRules(
  workspaceId: string,
): Promise<PmAutomationRule[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_automation_rules")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  return (data ?? []) as PmAutomationRule[];
}

// Fire the rules matching a task's new status. Called from the status-change
// action AFTER the update succeeded. Deterministic and rule-based (no AI):
// assign, add a system comment, notify the department. Best-effort — a
// failing action never fails the status change itself.
export async function applyAutomations(
  taskId: string,
  newStatus: PmTaskStatus,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_automation_rules")
    .select("*")
    .eq("workspace_id", task.workspace_id)
    .eq("trigger_status", newStatus)
    .eq("active", true);
  const rules = ((data ?? []) as PmAutomationRule[]).filter(
    (r) => !r.department_id || r.department_id === task.owner_department_id,
  );

  for (const rule of rules) {
    try {
      if (rule.actions.assign_to) {
        await supabase
          .from("pm_tasks")
          .update({ assignee_id: rule.actions.assign_to })
          .eq("id", taskId);
      }
      if (rule.actions.add_comment) {
        await supabase.from("pm_task_comments").insert({
          task_id: taskId,
          workspace_id: task.workspace_id,
          user_id: null,
          body: `[Automatisierung "${rule.name}"] ${rule.actions.add_comment}`,
          is_system: true,
        });
      }
      if (rule.actions.notify_department) {
        const recipients = await resolveDepartmentRecipients(
          task.owner_department_id,
          task.workspace_id,
        );
        await notify({
          workspaceId: task.workspace_id,
          recipients,
          type: "status_changed",
          title: `Automatisierung: ${task.title} ist jetzt "${TASK_STATUS_LABEL[newStatus]}"`,
          body: `Regel "${rule.name}" wurde ausgelöst.`,
          link: `/teams`,
          taskId: task.id,
        });
      }
    } catch {
      // Rule execution is best-effort; the status change already happened.
    }
  }
}

// --- Blueprints ------------------------------------------------------------------

export async function listBlueprints(
  workspaceId: string,
): Promise<PmBlueprint[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_blueprints")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  return (data ?? []) as PmBlueprint[];
}

export async function getBlueprint(id: string): Promise<PmBlueprint | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_blueprints")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as PmBlueprint) ?? null;
}

function dueDateFromDays(days: number | null | undefined): string | null {
  if (!days || days <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Instantiate a blueprint as a new task (plus its subtasks) in a department.
// Returns the new task id.
export async function instantiateBlueprint(opts: {
  blueprint: PmBlueprint;
  workspaceId: string;
  departmentId: string;
  createdBy: string;
  titleOverride?: string | null;
  folderId?: string | null;
  projectId?: string | null;
}): Promise<string> {
  const supabase = await createClient();
  const p: PmBlueprintPayload = opts.blueprint.payload ?? {};

  const { data: task, error } = await supabase
    .from("pm_tasks")
    .insert({
      workspace_id: opts.workspaceId,
      owner_department_id: opts.departmentId,
      folder_id: opts.folderId ?? null,
      project_id: opts.projectId ?? null,
      item_type_id: p.item_type_id ?? null,
      title: opts.titleOverride?.trim() || p.title || opts.blueprint.name,
      description: p.description ?? null,
      status: "backlog",
      priority: p.priority ?? "medium",
      source: "internal",
      effort_estimate_hours: p.effort_estimate_hours ?? null,
      due_date: dueDateFromDays(p.due_days),
      ai_mode: p.ai_mode ?? "inherit",
      created_by: opts.createdBy,
    })
    .select("id")
    .single();
  if (error || !task) {
    throw new Error(error?.message ?? "Vorlage konnte nicht angewendet werden");
  }

  const subtasks = (p.subtasks ?? []).filter((t) => t && t.trim());
  if (subtasks.length > 0) {
    await supabase.from("pm_tasks").insert(
      subtasks.map((title) => ({
        workspace_id: opts.workspaceId,
        owner_department_id: opts.departmentId,
        parent_task_id: task.id,
        title: title.trim(),
        status: "backlog",
        priority: p.priority ?? "medium",
        source: "internal",
        created_by: opts.createdBy,
      })),
    );
  }

  return task.id as string;
}
