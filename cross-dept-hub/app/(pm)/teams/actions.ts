"use server";

// Server actions for the cross-department PM module. Input is validated
// manually (the project has no Zod dependency yet); every write goes
// through the user's Supabase session so RLS enforces workspace scope.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateWorkspace } from "@/lib/pm/workspace";
import { getDepartmentById, slugify } from "@/lib/pm/departments";
import { runBriefingForTask } from "@/lib/pm/briefing";
import { suggestFilingForDocument } from "@/lib/pm/filing";
import {
  fileToSharePoint,
  seedDemoFolders,
} from "@/lib/pm/sharepoint";
import { notify, resolveDepartmentRecipients } from "@/lib/pm/notifications";
import { getTask } from "@/lib/pm/tasks";
import { isAiEnabledForDocument } from "@/lib/pm/projects";
import {
  applyAutomations,
  getBlueprint,
  instantiateBlueprint,
} from "@/lib/pm/automations";
import { getItemType } from "@/lib/pm/structure";
import { getRequestForm } from "@/lib/pm/forms";
import {
  notifyAssigned,
  notifyMentions,
  runCompletionSignals,
} from "@/lib/pm/signals";
import {
  addDurationDays,
  isCompletedStatus,
  TASK_STATUS_LABEL,
  type PmAiMode,
  type PmAutomationActions,
  type PmDependencyType,
  type PmDocKind,
  type PmItemTypeField,
  type PmRequestFormField,
  type PmTaskPriority,
  type PmTaskStatus,
} from "@/lib/pm/types";

const VALID_STATUS = new Set<PmTaskStatus>([
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
  "deferred",
  "cancelled",
  "archived",
]);
const VALID_DEP_TYPE = new Set<PmDependencyType>(["FS", "SS", "FF", "SF"]);
const VALID_PRIORITY = new Set<PmTaskPriority>([
  "low",
  "medium",
  "high",
  "urgent",
]);
const VALID_DOC_KIND = new Set<PmDocKind>([
  "document",
  "transcript",
  "note",
  "decision",
]);
const VALID_AI_MODE = new Set<PmAiMode>(["inherit", "on", "off"]);

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function aiMode(form: FormData, key: string): PmAiMode {
  const v = str(form, key) as PmAiMode;
  return VALID_AI_MODE.has(v) ? v : "inherit";
}

// Empty string → null (for optional FK selects like project_id).
function idOrNull(form: FormData, key: string): string | null {
  const v = str(form, key);
  return v || null;
}

function numOrNull(form: FormData, key: string): number | null {
  const raw = str(form, key);
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// --- Departments ----------------------------------------------------------

export async function createDepartment(form: FormData) {
  const name = str(form, "name");
  if (!name) redirect("/teams?error=Name+erforderlich");

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: dept, error } = await supabase
    .from("pm_departments")
    .insert({
      workspace_id: ws.id,
      name,
      slug: slugify(name) || `abteilung-${Date.now()}`,
      description: str(form, "description") || null,
      color: str(form, "color") || "#6b665d",
      ai_context: str(form, "ai_context") || null,
      created_by: user!.id,
    })
    .select("id, name")
    .single();
  if (error || !dept) {
    redirect(`/teams?error=${encodeURIComponent(error?.message ?? "Fehler")}`);
  }

  // Seed a default SharePoint folder skeleton so the AI filing assistant has
  // somewhere to suggest from immediately. Replaced by a real Graph sync
  // once the Microsoft connection is configured.
  await seedDemoFolders(ws.id, dept.id, dept.name);

  revalidatePath("/teams");
  redirect("/teams");
}

export async function updateDepartmentContext(form: FormData) {
  const slug = str(form, "slug");
  const id = str(form, "department_id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("pm_departments")
    .update({
      ai_context: str(form, "ai_context") || null,
      description: str(form, "description") || null,
      sprint_capacity_hours: numOrNull(form, "sprint_capacity_hours"),
    })
    .eq("id", id);
  if (error) redirect(`/teams/${slug}?tab=settings&error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}?tab=settings`);
}

// --- Projects -------------------------------------------------------------

export async function createProject(form: FormData) {
  const slug = str(form, "slug");
  const departmentId = str(form, "department_id");
  const name = str(form, "name");
  if (!name) redirect(`/teams/${slug}?tab=projects&error=Name+erforderlich`);

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("pm_projects").insert({
    workspace_id: ws.id,
    department_id: departmentId,
    name,
    description: str(form, "description") || null,
    color: str(form, "color") || "#6b665d",
    ai_mode: aiMode(form, "ai_mode"),
    created_by: user!.id,
  });
  if (error) {
    redirect(`/teams/${slug}?tab=projects&error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}?tab=projects`);
}

// Inline AI-mode change on a project (from the AiModeSelect control).
export async function updateProjectAiMode(form: FormData) {
  const slug = str(form, "slug");
  const projectId = str(form, "project_id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("pm_projects")
    .update({ ai_mode: aiMode(form, "ai_mode") })
    .eq("id", projectId);
  if (error) {
    redirect(`/teams/${slug}?tab=projects&error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}?tab=projects`);
}

export async function archiveProject(form: FormData) {
  const slug = str(form, "slug");
  const projectId = str(form, "project_id");
  const supabase = await createClient();
  await supabase
    .from("pm_projects")
    .update({ status: "archived", deleted_at: new Date().toISOString() })
    .eq("id", projectId);
  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}?tab=projects`);
}

// --- Internal tasks -------------------------------------------------------

export async function createInternalTask(form: FormData) {
  const slug = str(form, "slug");
  const departmentId = str(form, "department_id");
  const title = str(form, "title");

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Blueprint path: instantiate the template (title acts as an override).
  const blueprintId = idOrNull(form, "blueprint_id");
  if (blueprintId) {
    const blueprint = await getBlueprint(blueprintId);
    if (!blueprint) redirect(`/teams/${slug}?error=Vorlage+nicht+gefunden`);
    try {
      await instantiateBlueprint({
        blueprint,
        workspaceId: ws.id,
        departmentId,
        createdBy: user!.id,
        titleOverride: title || null,
        folderId: idOrNull(form, "folder_id"),
        projectId: idOrNull(form, "project_id"),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fehler";
      redirect(`/teams/${slug}?error=${encodeURIComponent(msg)}`);
    }
    revalidatePath(`/teams/${slug}`);
    redirect(`/teams/${slug}`);
  }

  if (!title) redirect(`/teams/${slug}?error=Titel+erforderlich`);

  const priority = str(form, "priority") as PmTaskPriority;
  const assigneeId = idOrNull(form, "assignee_id");
  const { data: created, error } = await supabase
    .from("pm_tasks")
    .insert({
      workspace_id: ws.id,
      owner_department_id: departmentId,
      project_id: idOrNull(form, "project_id"),
      folder_id: idOrNull(form, "folder_id"),
      item_type_id: idOrNull(form, "item_type_id"),
      assignee_id: assigneeId,
      ai_mode: aiMode(form, "ai_mode"),
      title,
      description: str(form, "description") || null,
      status: "backlog",
      priority: VALID_PRIORITY.has(priority) ? priority : "medium",
      source: "internal",
      effort_estimate_hours: numOrNull(form, "effort_estimate_hours"),
      start_date: str(form, "start_date") || null,
      due_date: str(form, "due_date") || null,
      created_by: user!.id,
    })
    .select("id")
    .single();
  if (error) redirect(`/teams/${slug}?error=${encodeURIComponent(error.message)}`);

  // Wrike-style inbox event: being assigned notifies you.
  if (created && assigneeId) {
    await notifyAssigned(
      { id: created.id, workspace_id: ws.id, title, owner_department_id: departmentId },
      assigneeId,
      user!.id,
      `/teams/${slug}/tasks/${created.id}`,
    );
  }

  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}`);
}

// Inline AI-mode change on a task (from the AiModeSelect control).
export async function updateTaskAiMode(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("pm_tasks")
    .update({ ai_mode: aiMode(form, "ai_mode") })
    .eq("id", taskId);
  if (error) {
    redirect(`/teams/${slug}/tasks/${taskId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/teams/${slug}/tasks/${taskId}`);
  redirect(`/teams/${slug}/tasks/${taskId}`);
}

export async function updateTaskStatus(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const status = str(form, "status") as PmTaskStatus;
  if (!VALID_STATUS.has(status)) redirect(`/teams/${slug}?error=Status+ungueltig`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("pm_tasks")
    .update({ status })
    .eq("id", taskId);
  if (error) redirect(`/teams/${slug}?error=${encodeURIComponent(error.message)}`);

  // Fire matching automation rules (assign / comment / notify). Rule-based,
  // no AI; best-effort by design.
  await applyAutomations(taskId, status);

  // Wrike-Bot signals: entering the Completed group may unblock successors
  // ("ready to start") and settle a parent's subtasks ("review ready").
  if (isCompletedStatus(status)) {
    await runCompletionSignals(taskId);
  }

  // Status update on a cross-department request → tell the requester.
  const task = await getTask(taskId);
  if (task?.source === "cross_dept" && task.requester_department_id) {
    const requester = await getDepartmentById(task.requester_department_id);
    if (requester) {
      const recipients = await resolveDepartmentRecipients(
        requester.id,
        task.workspace_id,
      );
      await notify({
        workspaceId: task.workspace_id,
        recipients,
        type: "status_changed",
        title: `Status aktualisiert: ${task.title}`,
        body: `Neuer Status: ${TASK_STATUS_LABEL[status]}`,
        link: `/teams/${requester.slug}/tasks/${task.id}`,
        taskId: task.id,
      });
    }
  }

  revalidatePath(`/teams/${slug}`);
  const back = str(form, "redirect_to");
  redirect(back || `/teams/${slug}`);
}

export async function updateTaskDetails(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const supabase = await createClient();
  const before = await getTask(taskId);

  const startDate = str(form, "start_date") || null;
  let dueDate = str(form, "due_date") || null;

  // Wrike duration semantics: with a start date and a duration, the due
  // date is start + N days ("Working Days Only" skips weekends). An explicit
  // duration wins over the due-date field.
  const duration = numOrNull(form, "duration_days");
  const workingDaysOnly = form.get("working_days_only") === "on";
  if (startDate && duration && duration > 0) {
    dueDate = addDurationDays(startDate, duration, workingDaysOnly);
  }

  const update: Record<string, unknown> = {
    effort_estimate_hours: numOrNull(form, "effort_estimate_hours"),
    sprint: str(form, "sprint") || null,
    start_date: startDate,
    due_date: dueDate,
    accepted_into_sprint: form.get("accepted_into_sprint") === "on",
    project_id: idOrNull(form, "project_id"),
    folder_id: idOrNull(form, "folder_id"),
    item_type_id: idOrNull(form, "item_type_id"),
    assignee_id: idOrNull(form, "assignee_id"),
    ai_mode: aiMode(form, "ai_mode"),
  };
  const priority = str(form, "priority") as PmTaskPriority;
  if (VALID_PRIORITY.has(priority)) update.priority = priority;

  const { error } = await supabase.from("pm_tasks").update(update).eq("id", taskId);
  if (error) {
    redirect(`/teams/${slug}/tasks/${taskId}?error=${encodeURIComponent(error.message)}`);
  }

  // Newly assigned person gets a Wrike-style inbox notification.
  const newAssignee = update.assignee_id as string | null;
  if (before && newAssignee && newAssignee !== before.assignee_id) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await notifyAssigned(
      before,
      newAssignee,
      user?.id ?? null,
      `/teams/${slug}/tasks/${taskId}`,
    );
  }

  revalidatePath(`/teams/${slug}/tasks/${taskId}`);
  redirect(`/teams/${slug}/tasks/${taskId}`);
}

// --- Cross-department requests (the inbox) --------------------------------

export async function createCrossDeptRequest(form: FormData) {
  const requesterId = str(form, "requester_department_id");
  const ownerId = str(form, "owner_department_id");
  const title = str(form, "title");

  if (!requesterId || !ownerId || !title) {
    redirect("/teams/new-request?error=Bitte+alle+Pflichtfelder+ausfuellen");
  }
  if (requesterId === ownerId) {
    redirect("/teams/new-request?error=Anfragende+und+ausfuehrende+Abteilung+muessen+unterschiedlich+sein");
  }

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const priority = str(form, "priority") as PmTaskPriority;
  const { data: task, error } = await supabase
    .from("pm_tasks")
    .insert({
      workspace_id: ws.id,
      owner_department_id: ownerId,
      requester_department_id: requesterId,
      title,
      description: str(form, "description") || null,
      status: "backlog",
      priority: VALID_PRIORITY.has(priority) ? priority : "medium",
      source: "cross_dept",
      project_id: idOrNull(form, "project_id"),
      ai_mode: aiMode(form, "ai_mode"),
      effort_estimate_hours: numOrNull(form, "effort_estimate_hours"),
      due_date: str(form, "due_date") || null,
      created_by: user!.id,
    })
    .select("id")
    .single();
  if (error || !task) {
    redirect(`/teams/new-request?error=${encodeURIComponent(error?.message ?? "Fehler")}`);
  }

  const [owner, requester] = await Promise.all([
    getDepartmentById(ownerId),
    getDepartmentById(requesterId),
  ]);

  // Notify the receiving department (in-app + browser + email).
  if (owner) {
    const recipients = await resolveDepartmentRecipients(owner.id, ws.id);
    await notify({
      workspaceId: ws.id,
      recipients,
      type: "request_created",
      title: `Neue Anfrage von ${requester?.name ?? "einer Abteilung"}: ${title}`,
      body: str(form, "description") || "Neue abteilungsübergreifende Anfrage im Posteingang.",
      link: `/teams/${owner.slug}/tasks/${task.id}`,
      taskId: task.id,
    });
  }

  // Fire the AI agent automatically so a briefing + draft reply is waiting
  // when the receiving department opens its inbox — only if auto-briefing is
  // on and the requester left the per-request toggle on. runBriefingForTask
  // self-gates on the task's effective AI state (task → project → workspace),
  // so a project/task with AI off is respected. Best-effort.
  if (ws.ai_auto_briefing && form.get("auto_brief") === "on") {
    try {
      await runBriefingForTask(task.id);
    } catch {
      // swallow — request creation must never fail because of the AI step
    }
  }

  revalidatePath("/teams");
  if (owner) revalidatePath(`/teams/${owner.slug}`);
  redirect(owner ? `/teams/${owner.slug}?tab=incoming` : "/teams");
}

// --- AI briefing approval -------------------------------------------------

export async function runBriefing(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  // runBriefingForTask enforces the effective AI state (task → project →
  // workspace) and throws a readable message if AI is off for this task.
  try {
    await runBriefingForTask(taskId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "KI-Fehler";
    redirect(`/teams/${slug}/tasks/${taskId}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/teams/${slug}/tasks/${taskId}`);
  redirect(`/teams/${slug}/tasks/${taskId}`);
}

export async function decideBriefing(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const briefingId = str(form, "briefing_id");
  const decision = str(form, "decision"); // "accept" | "reject"
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const newStatus = decision === "accept" ? "accepted" : "rejected";
  const { data: briefing, error } = await supabase
    .from("pm_task_briefings")
    .update({ status: newStatus })
    .eq("id", briefingId)
    .select("suggested_response, estimated_hours")
    .single();
  if (error) {
    redirect(`/teams/${slug}/tasks/${taskId}?error=${encodeURIComponent(error.message)}`);
  }

  if (decision === "accept" && briefing) {
    // Post the AI draft reply as a real comment and adopt the estimate.
    await supabase.from("pm_task_comments").insert({
      task_id: taskId,
      workspace_id: (await getOrCreateWorkspace()).id,
      user_id: user!.id,
      body: briefing.suggested_response,
      is_system: false,
    });
    if (briefing.estimated_hours != null) {
      await supabase
        .from("pm_tasks")
        .update({ effort_estimate_hours: briefing.estimated_hours, status: "todo" })
        .eq("id", taskId);
    }

    // Tell the requesting department their request was accepted, with the reply.
    const task = await getTask(taskId);
    if (task?.requester_department_id) {
      const requester = await getDepartmentById(task.requester_department_id);
      if (requester) {
        const recipients = await resolveDepartmentRecipients(
          requester.id,
          task.workspace_id,
        );
        await notify({
          workspaceId: task.workspace_id,
          recipients,
          type: "briefing_accepted",
          title: `Anfrage angenommen: ${task.title}`,
          body: briefing.suggested_response,
          link: `/teams/${requester.slug}/tasks/${task.id}`,
          taskId: task.id,
        });
      }
    }
  }

  revalidatePath(`/teams/${slug}/tasks/${taskId}`);
  redirect(`/teams/${slug}/tasks/${taskId}`);
}

// --- Comments & reminders -------------------------------------------------

export async function addComment(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const bodyText = str(form, "body");
  if (!bodyText) redirect(`/teams/${slug}/tasks/${taskId}`);

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("pm_task_comments").insert({
    task_id: taskId,
    workspace_id: ws.id,
    user_id: user!.id,
    body: bodyText,
    is_system: false,
  });

  const task = await getTask(taskId);
  if (task) {
    // @Mentions first (Wrike inbox event, with email) — mentioned users are
    // excluded from the generic department ping below.
    const mentioned = await notifyMentions(
      task,
      bodyText,
      user!.id,
      `/teams/${slug}/tasks/${taskId}`,
    );

    // Ping the involved departments (in-app + browser, no email per comment).
    const deptIds = [task.owner_department_id, task.requester_department_id].filter(
      (id): id is string => Boolean(id),
    );
    const recipientLists = await Promise.all(
      deptIds.map((id) => resolveDepartmentRecipients(id, ws.id)),
    );
    const recipients = recipientLists
      .flat()
      .filter((r) => r.user_id !== user!.id && !mentioned.includes(r.user_id));
    await notify({
      workspaceId: ws.id,
      recipients,
      type: "comment_added",
      title: `Neuer Kommentar: ${task.title}`,
      body: bodyText,
      link: `/teams/${slug}/tasks/${taskId}`,
      taskId,
      sendEmail: false,
    });
  }

  revalidatePath(`/teams/${slug}/tasks/${taskId}`);
  redirect(`/teams/${slug}/tasks/${taskId}`);
}

export async function addReminder(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const remindAt = str(form, "remind_at");
  const reason = str(form, "reason") || "Erinnerung";
  if (!remindAt) redirect(`/teams/${slug}/tasks/${taskId}`);

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  await supabase.from("pm_task_reminders").insert({
    task_id: taskId,
    workspace_id: ws.id,
    remind_at: new Date(remindAt).toISOString(),
    reason,
    status: "pending",
  });
  revalidatePath(`/teams/${slug}/tasks/${taskId}`);
  redirect(`/teams/${slug}/tasks/${taskId}`);
}

// --- Knowledge base -------------------------------------------------------

export async function addDocument(form: FormData) {
  const slug = str(form, "slug");
  const departmentId = str(form, "department_id");
  const title = str(form, "title");
  if (!title) redirect(`/teams/${slug}?tab=knowledge&error=Titel+erforderlich`);

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const kind = str(form, "kind") as PmDocKind;
  const { data: doc, error } = await supabase
    .from("pm_documents")
    .insert({
      workspace_id: ws.id,
      department_id: departmentId,
      project_id: idOrNull(form, "project_id"),
      ai_mode: aiMode(form, "ai_mode"),
      title,
      kind: VALID_DOC_KIND.has(kind) ? kind : "document",
      content: str(form, "content") || null,
      source: str(form, "source") || null,
      created_by: user!.id,
    })
    .select("id")
    .single();
  if (error || !doc) {
    redirect(`/teams/${slug}?tab=knowledge&error=${encodeURIComponent(error?.message ?? "Fehler")}`);
  }

  // Ask the AI filing assistant for a folder + name suggestion — only when
  // auto-filing is on. suggestFilingForDocument self-gates on the document's
  // effective AI state (document → project → workspace), so a document/project
  // with AI off is kept exactly as entered. Best-effort.
  if (ws.ai_auto_filing) {
    try {
      await suggestFilingForDocument(doc.id);
    } catch {
      // swallow — suggestion is optional
    }
  }

  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}?tab=knowledge`);
}

export async function rerunFilingSuggestion(form: FormData) {
  const slug = str(form, "slug");
  const documentId = str(form, "document_id");
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("pm_documents")
    .select("ai_mode, project_id")
    .eq("id", documentId)
    .maybeSingle();
  if (doc && !(await isAiEnabledForDocument(doc))) {
    redirect(`/teams/${slug}?tab=knowledge&error=KI+ist+für+dieses+Dokument+deaktiviert`);
  }
  try {
    await suggestFilingForDocument(documentId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "KI-Fehler";
    redirect(`/teams/${slug}?tab=knowledge&error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}?tab=knowledge`);
}

// User confirms (or edits) the AI's filing suggestion. Marks the document
// filed and, when a live SharePoint connection exists, uploads it.
export async function confirmDocumentFiling(form: FormData) {
  const slug = str(form, "slug");
  const documentId = str(form, "document_id");
  const folderPath = str(form, "folder_path");
  const fileName = str(form, "file_name");
  if (!folderPath || !fileName) {
    redirect(`/teams/${slug}?tab=knowledge&error=Ordner+und+Name+erforderlich`);
  }

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("pm_documents")
    .select("id, department_id, content")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) {
    redirect(`/teams/${slug}?tab=knowledge&error=Dokument+nicht+gefunden`);
  }

  const department = await getDepartmentById(doc.department_id);

  // Best-effort upload to SharePoint via Graph (no-op without a connection).
  let itemId: string | null = null;
  let webUrl: string | null = null;
  if (department) {
    const result = await fileToSharePoint({
      department,
      folderPath,
      fileName,
      content: doc.content ?? "",
    });
    if (result) {
      itemId = result.itemId;
      webUrl = result.webUrl;
    }
  }

  const { error } = await supabase
    .from("pm_documents")
    .update({
      title: fileName,
      confirmed_folder_path: folderPath,
      filing_status: "confirmed",
      sharepoint_item_id: itemId,
      sharepoint_web_url: webUrl,
    })
    .eq("id", documentId);
  if (error) {
    redirect(`/teams/${slug}?tab=knowledge&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}?tab=knowledge`);
}

// --- AI settings ----------------------------------------------------------

// Workspace-level switches for the AI features. Checkbox semantics: an
// unchecked box is absent from the form, so a missing value means "off".
export async function updateAiSettings(form: FormData) {
  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const { error } = await supabase
    .from("pm_workspaces")
    .update({
      ai_enabled: form.get("ai_enabled") === "on",
      ai_auto_briefing: form.get("ai_auto_briefing") === "on",
      ai_auto_filing: form.get("ai_auto_filing") === "on",
    })
    .eq("id", ws.id);
  if (error) {
    redirect(`/teams/settings?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/teams/settings");
  revalidatePath("/teams");
  redirect("/teams/settings?saved=1");
}

// --- Notifications --------------------------------------------------------

export async function markNotificationRead(form: FormData) {
  const id = str(form, "id");
  const supabase = await createClient();
  await supabase
    .from("pm_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/teams/notifications");
  redirect("/teams/notifications");
}

export async function markAllNotificationsRead() {
  const supabase = await createClient();
  await supabase
    .from("pm_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  revalidatePath("/teams/notifications");
  redirect("/teams/notifications");
}

// --- Feedback (trial) -----------------------------------------------------

export async function submitFeedback(form: FormData) {
  const message = str(form, "message");
  if (!message) redirect("/teams/feedback?error=Bitte+etwas+eingeben");

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("pm_feedback").insert({
    workspace_id: ws.id,
    user_id: user!.id,
    area: str(form, "area") || null,
    sentiment: str(form, "sentiment") || null,
    message,
    page_url: str(form, "page_url") || null,
  });
  if (error) {
    redirect(`/teams/feedback?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/teams/feedback");
  redirect("/teams/feedback?saved=1");
}

// --- Folders (hierarchy) ----------------------------------------------------

export async function createFolder(form: FormData) {
  const slug = str(form, "slug");
  const departmentId = str(form, "department_id");
  const name = str(form, "name");
  if (!name) redirect(`/teams/${slug}?tab=projects&error=Name+erforderlich`);

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("pm_folders").insert({
    workspace_id: ws.id,
    department_id: departmentId,
    parent_folder_id: idOrNull(form, "parent_folder_id"),
    name,
    description: str(form, "description") || null,
    created_by: user!.id,
  });
  if (error) {
    redirect(`/teams/${slug}?tab=projects&error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}?tab=projects`);
}

export async function archiveFolder(form: FormData) {
  const slug = str(form, "slug");
  const supabase = await createClient();
  await supabase
    .from("pm_folders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", str(form, "folder_id"));
  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}?tab=projects`);
}

// --- Subtasks -----------------------------------------------------------------

export async function addSubtask(form: FormData) {
  const slug = str(form, "slug");
  const parentId = str(form, "parent_task_id");
  const title = str(form, "title");
  const detail = `/teams/${slug}/tasks/${parentId}`;
  if (!title) redirect(`${detail}?error=Titel+erforderlich`);

  const parent = await getTask(parentId);
  if (!parent) redirect(`${detail}?error=Aufgabe+nicht+gefunden`);
  // One level of nesting like Wrike's task → subtask; no sub-subtasks.
  if (parent.parent_task_id) {
    redirect(`${detail}?error=Unteraufgaben+können+keine+eigenen+Unteraufgaben+haben`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("pm_tasks").insert({
    workspace_id: parent.workspace_id,
    owner_department_id: parent.owner_department_id,
    parent_task_id: parent.id,
    project_id: parent.project_id,
    folder_id: parent.folder_id,
    title,
    status: "backlog",
    priority: parent.priority,
    source: "internal",
    created_by: user!.id,
  });
  if (error) redirect(`${detail}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(detail);
  redirect(detail);
}

// --- Custom item types ----------------------------------------------------------

export async function createItemType(form: FormData) {
  const name = str(form, "name");
  if (!name) redirect(`/teams/settings?error=Name+erforderlich`);

  // Field schema comes in as textarea lines: "key | Label | type[: opt1, opt2]"
  const fields: PmItemTypeField[] = [];
  for (const line of str(form, "fields_raw").split("\n")) {
    const [rawKey, rawLabel, rawType] = line.split("|").map((s) => s?.trim());
    if (!rawKey) continue;
    const [typePart, optsPart] = (rawType ?? "text").split(":");
    const type = ["text", "number", "date", "select"].includes(typePart?.trim())
      ? (typePart.trim() as PmItemTypeField["type"])
      : "text";
    fields.push({
      key: rawKey.toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
      label: rawLabel || rawKey,
      type,
      options:
        type === "select" && optsPart
          ? optsPart.split(",").map((o) => o.trim()).filter(Boolean)
          : undefined,
    });
  }

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("pm_item_types").insert({
    workspace_id: ws.id,
    name,
    icon: str(form, "icon") || "◆",
    color: str(form, "color") || "#6b665d",
    fields,
    created_by: user!.id,
  });
  if (error) {
    redirect(`/teams/settings?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/teams/settings");
  redirect("/teams/settings?saved=1");
}

export async function deleteItemType(form: FormData) {
  const supabase = await createClient();
  await supabase
    .from("pm_item_types")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", str(form, "item_type_id"));
  revalidatePath("/teams/settings");
  redirect("/teams/settings?saved=1");
}

// Save a task's custom-field values against its item type's schema. Only
// keys defined in the schema are persisted.
export async function saveCustomFields(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const detail = `/teams/${slug}/tasks/${taskId}`;

  const task = await getTask(taskId);
  if (!task?.item_type_id) redirect(detail);
  const itemType = await getItemType(task.item_type_id);
  if (!itemType) redirect(detail);

  const values: Record<string, string> = {};
  for (const field of itemType.fields) {
    const v = str(form, `cf_${field.key}`);
    if (v) values[field.key] = v;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pm_tasks")
    .update({ custom_fields: values })
    .eq("id", taskId);
  if (error) redirect(`${detail}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(detail);
  redirect(detail);
}

// --- Cross-tagging ---------------------------------------------------------------

export async function addCrossTag(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const departmentId = str(form, "department_id");
  const detail = `/teams/${slug}/tasks/${taskId}`;

  const task = await getTask(taskId);
  if (!task) redirect(`${detail}?error=Aufgabe+nicht+gefunden`);
  if (departmentId === task.owner_department_id) {
    redirect(`${detail}?error=Die+Aufgabe+lebt+bereits+in+dieser+Abteilung`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pm_task_locations").insert({
    task_id: taskId,
    department_id: departmentId,
    folder_id: idOrNull(form, "folder_id"),
  });
  if (error && !error.message.includes("duplicate")) {
    redirect(`${detail}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(detail);
  redirect(detail);
}

export async function removeCrossTag(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const supabase = await createClient();
  await supabase
    .from("pm_task_locations")
    .delete()
    .eq("task_id", taskId)
    .eq("department_id", str(form, "department_id"));
  revalidatePath(`/teams/${slug}/tasks/${taskId}`);
  redirect(`/teams/${slug}/tasks/${taskId}`);
}

// --- Automation rules ---------------------------------------------------------------

export async function createAutomationRule(form: FormData) {
  const name = str(form, "name");
  const trigger = str(form, "trigger_status") as PmTaskStatus;
  if (!name) redirect(`/teams/settings?error=Name+erforderlich`);
  if (!VALID_STATUS.has(trigger)) {
    redirect(`/teams/settings?error=Status+ungueltig`);
  }

  const actions: PmAutomationActions = {
    assign_to: idOrNull(form, "assign_to"),
    add_comment: str(form, "add_comment") || null,
    notify_department: form.get("notify_department") === "on",
  };

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("pm_automation_rules").insert({
    workspace_id: ws.id,
    department_id: idOrNull(form, "department_id"),
    name,
    trigger_status: trigger,
    actions,
    created_by: user!.id,
  });
  if (error) {
    redirect(`/teams/settings?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/teams/settings");
  redirect("/teams/settings?saved=1");
}

export async function toggleAutomationRule(form: FormData) {
  const supabase = await createClient();
  await supabase
    .from("pm_automation_rules")
    .update({ active: str(form, "active") === "true" })
    .eq("id", str(form, "rule_id"));
  revalidatePath("/teams/settings");
  redirect("/teams/settings");
}

export async function deleteAutomationRule(form: FormData) {
  const supabase = await createClient();
  await supabase
    .from("pm_automation_rules")
    .delete()
    .eq("id", str(form, "rule_id"));
  revalidatePath("/teams/settings");
  redirect("/teams/settings?saved=1");
}

// --- Blueprints ------------------------------------------------------------------------

// Capture an existing task (incl. its subtask titles) as a reusable template.
export async function createBlueprintFromTask(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const detail = `/teams/${slug}/tasks/${taskId}`;

  const task = await getTask(taskId);
  if (!task) redirect(`${detail}?error=Aufgabe+nicht+gefunden`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: subs } = await supabase
    .from("pm_tasks")
    .select("title")
    .eq("parent_task_id", taskId)
    .is("deleted_at", null);

  const { error } = await supabase.from("pm_blueprints").insert({
    workspace_id: task.workspace_id,
    department_id: task.owner_department_id,
    name: str(form, "name") || task.title,
    description: `Vorlage aus Aufgabe "${task.title}"`,
    payload: {
      title: task.title,
      description: task.description,
      priority: task.priority,
      effort_estimate_hours: task.effort_estimate_hours,
      item_type_id: task.item_type_id,
      ai_mode: task.ai_mode,
      subtasks: (subs ?? []).map((s) => s.title),
    },
    created_by: user!.id,
  });
  if (error) redirect(`${detail}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(detail);
  redirect(`${detail}?saved=Vorlage+gespeichert`);
}

export async function deleteBlueprint(form: FormData) {
  const supabase = await createClient();
  await supabase
    .from("pm_blueprints")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", str(form, "blueprint_id"));
  revalidatePath("/teams/settings");
  redirect("/teams/settings?saved=1");
}

// --- Request forms -----------------------------------------------------------------------

export async function createRequestForm(form: FormData) {
  const title = str(form, "title");
  const targetDepartmentId = str(form, "target_department_id");
  if (!title || !targetDepartmentId) {
    redirect(`/teams/settings?error=Titel+und+Zielabteilung+erforderlich`);
  }

  // Same line format as item types: "key | Label | type[: options]"
  const fields: PmRequestFormField[] = [];
  for (const line of str(form, "fields_raw").split("\n")) {
    const [rawKey, rawLabel, rawType, rawRequired] = line
      .split("|")
      .map((s) => s?.trim());
    if (!rawKey) continue;
    const [typePart, optsPart] = (rawType ?? "text").split(":");
    const type = ["text", "textarea", "number", "date", "select"].includes(
      typePart?.trim(),
    )
      ? (typePart.trim() as PmRequestFormField["type"])
      : "text";
    fields.push({
      key: rawKey.toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
      label: rawLabel || rawKey,
      type,
      required: rawRequired === "pflicht",
      options:
        type === "select" && optsPart
          ? optsPart.split(",").map((o) => o.trim()).filter(Boolean)
          : undefined,
    });
  }

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const priority = str(form, "default_priority") as PmTaskPriority;
  const { error } = await supabase.from("pm_request_forms").insert({
    workspace_id: ws.id,
    target_department_id: targetDepartmentId,
    title,
    description: str(form, "description") || null,
    fields,
    blueprint_id: idOrNull(form, "blueprint_id"),
    default_priority: VALID_PRIORITY.has(priority) ? priority : "medium",
    default_due_days: numOrNull(form, "default_due_days"),
    created_by: user!.id,
  });
  if (error) {
    redirect(`/teams/settings?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/teams/settings");
  redirect("/teams/settings?saved=1");
}

export async function toggleRequestForm(form: FormData) {
  const supabase = await createClient();
  await supabase
    .from("pm_request_forms")
    .update({ active: str(form, "active") === "true" })
    .eq("id", str(form, "form_id"));
  revalidatePath("/teams/settings");
  redirect("/teams/settings");
}

// Submission: routes the intake to the target department, computes the due
// date, optionally instantiates the linked blueprint, and stores the answers
// on the task (description + custom_fields).
export async function submitRequestForm(form: FormData) {
  const formId = str(form, "form_id");
  const requestForm = await getRequestForm(formId);
  if (!requestForm || !requestForm.active) {
    redirect(`/teams?error=Formular+nicht+gefunden`);
  }

  const answers: Record<string, string> = {};
  const lines: string[] = [];
  for (const field of requestForm.fields) {
    const v = str(form, `f_${field.key}`);
    if (field.required && !v) {
      redirect(
        `/teams/forms/${formId}?error=${encodeURIComponent(`${field.label} ist erforderlich`)}`,
      );
    }
    if (v) {
      answers[field.key] = v;
      lines.push(`${field.label}: ${v}`);
    }
  }

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const title =
    str(form, "request_title") || `${requestForm.title} - Anfrage`;
  const dueDate = requestForm.default_due_days
    ? new Date(Date.now() + requestForm.default_due_days * 86400_000)
        .toISOString()
        .slice(0, 10)
    : null;

  let taskId: string;
  if (requestForm.blueprint_id) {
    const blueprint = await getBlueprint(requestForm.blueprint_id);
    if (blueprint) {
      taskId = await instantiateBlueprint({
        blueprint,
        workspaceId: ws.id,
        departmentId: requestForm.target_department_id,
        createdBy: user!.id,
        titleOverride: title,
      });
      await supabase
        .from("pm_tasks")
        .update({
          description: lines.join("\n") || null,
          custom_fields: answers,
          due_date: dueDate,
          priority: requestForm.default_priority,
        })
        .eq("id", taskId);
    } else {
      taskId = await insertFormTask();
    }
  } else {
    taskId = await insertFormTask();
  }

  async function insertFormTask(): Promise<string> {
    const { data, error } = await supabase
      .from("pm_tasks")
      .insert({
        workspace_id: ws.id,
        owner_department_id: requestForm!.target_department_id,
        title,
        description: lines.join("\n") || null,
        custom_fields: answers,
        status: "backlog",
        priority: requestForm!.default_priority,
        source: "internal",
        due_date: dueDate,
        created_by: user!.id,
      })
      .select("id")
      .single();
    if (error || !data) {
      redirect(
        `/teams/forms/${formId}?error=${encodeURIComponent(error?.message ?? "Fehler")}`,
      );
    }
    return data.id as string;
  }

  // Tell the receiving department a structured request landed.
  const target = await getDepartmentById(requestForm.target_department_id);
  if (target) {
    const recipients = await resolveDepartmentRecipients(target.id, ws.id);
    await notify({
      workspaceId: ws.id,
      recipients,
      type: "request_created",
      title: `Neue Anfrage über Formular "${requestForm.title}": ${title}`,
      body: lines.join("\n") || null,
      link: `/teams/${target.slug}/tasks/${taskId}`,
      taskId,
    });
  }

  redirect(`/teams/forms/${formId}?submitted=1`);
}

// --- Timesheets -----------------------------------------------------------------------------

export async function logTime(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const detail = `/teams/${slug}/tasks/${taskId}`;
  const hours = numOrNull(form, "hours");
  if (!hours || hours <= 0) redirect(`${detail}?error=Stunden+erforderlich`);

  const task = await getTask(taskId);
  if (!task) redirect(`${detail}?error=Aufgabe+nicht+gefunden`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("pm_time_entries").insert({
    workspace_id: task.workspace_id,
    task_id: taskId,
    user_id: user!.id,
    hours,
    entry_date: str(form, "entry_date") || new Date().toISOString().slice(0, 10),
    note: str(form, "note") || null,
  });
  if (error) redirect(`${detail}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(detail);
  redirect(detail);
}

// --- Approvals -------------------------------------------------------------------------------

export async function requestApproval(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const approverId = str(form, "approver_id");
  const detail = `/teams/${slug}/tasks/${taskId}`;
  if (!approverId) redirect(`${detail}?error=Freigebende+Person+erforderlich`);

  const task = await getTask(taskId);
  if (!task) redirect(`${detail}?error=Aufgabe+nicht+gefunden`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("pm_approvals").insert({
    workspace_id: task.workspace_id,
    task_id: taskId,
    approver_id: approverId,
    note: str(form, "note") || null,
    created_by: user!.id,
  });
  if (error) redirect(`${detail}?error=${encodeURIComponent(error.message)}`);

  // The approver gets a direct notification with a deep link.
  const { data: member } = await supabase
    .from("pm_workspace_members")
    .select("user_id, email")
    .eq("workspace_id", task.workspace_id)
    .eq("user_id", approverId)
    .maybeSingle();
  if (member) {
    await notify({
      workspaceId: task.workspace_id,
      recipients: [{ user_id: member.user_id, email: member.email ?? null }],
      type: "comment_added",
      title: `Freigabe angefragt: ${task.title}`,
      body: str(form, "note") || null,
      link: detail,
      taskId,
    });
  }

  revalidatePath(detail);
  redirect(detail);
}

export async function decideApproval(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const approvalId = str(form, "approval_id");
  const decision = str(form, "decision");
  const detail = taskId ? `/teams/${slug}/tasks/${taskId}` : "/teams/dashboard";
  if (decision !== "approved" && decision !== "rejected") redirect(detail);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only the named approver can decide — that is what makes the trail an
  // audit trail. RLS scopes to the workspace; this narrows to the person.
  const { error } = await supabase
    .from("pm_approvals")
    .update({
      status: decision,
      decision_comment: str(form, "decision_comment") || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
    .eq("approver_id", user!.id)
    .eq("status", "pending");
  if (error) redirect(`${detail}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(detail);
  revalidatePath("/teams/dashboard");
  redirect(detail);
}

// --- Dependencies (typed, Wrike FS/SS/FF/SF) --------------------------------

export async function addDependency(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const dependsOn = str(form, "depends_on_task_id");
  const detail = `/teams/${slug}/tasks/${taskId}`;
  if (!dependsOn || dependsOn === taskId) {
    redirect(`${detail}?error=Ungueltige+Abhaengigkeit`);
  }
  const depType = str(form, "dependency_type") as PmDependencyType;

  const supabase = await createClient();
  const { error } = await supabase.from("pm_task_dependencies").insert({
    task_id: taskId,
    depends_on_task_id: dependsOn,
    dependency_type: VALID_DEP_TYPE.has(depType) ? depType : "FS",
  });
  if (error && !error.message.includes("duplicate")) {
    redirect(`${detail}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(detail);
  redirect(detail);
}

export async function removeDependency(form: FormData) {
  const slug = str(form, "slug");
  const taskId = str(form, "task_id");
  const supabase = await createClient();
  await supabase
    .from("pm_task_dependencies")
    .delete()
    .eq("task_id", taskId)
    .eq("depends_on_task_id", str(form, "depends_on_task_id"));
  revalidatePath(`/teams/${slug}/tasks/${taskId}`);
  redirect(`/teams/${slug}/tasks/${taskId}`);
}

// --- Bookmarks ---------------------------------------------------------------

export async function addBookmark(form: FormData) {
  const slug = str(form, "slug");
  const departmentId = str(form, "department_id");
  const title = str(form, "title");
  const url = str(form, "url");
  if (!title || !url) {
    redirect(`/teams/${slug}?error=Titel+und+URL+erforderlich`);
  }

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("pm_bookmarks").insert({
    workspace_id: ws.id,
    department_id: departmentId,
    section: str(form, "section") || null,
    title,
    url,
    created_by: user!.id,
  });
  if (error) redirect(`/teams/${slug}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}`);
}

export async function deleteBookmark(form: FormData) {
  const slug = str(form, "slug");
  const supabase = await createClient();
  await supabase.from("pm_bookmarks").delete().eq("id", str(form, "bookmark_id"));
  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}`);
}

// --- Department (space) members -----------------------------------------------

export async function addDepartmentMember(form: FormData) {
  const slug = str(form, "slug");
  const departmentId = str(form, "department_id");
  const userId = str(form, "user_id");
  if (!userId) redirect(`/teams/${slug}?tab=settings`);

  const supabase = await createClient();
  const role = str(form, "role");
  const { error } = await supabase.from("pm_department_members").insert({
    department_id: departmentId,
    user_id: userId,
    role: role === "lead" || role === "viewer" ? role : "member",
  });
  if (error && !error.message.includes("duplicate")) {
    redirect(`/teams/${slug}?tab=settings&error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}?tab=settings`);
}

export async function removeDepartmentMember(form: FormData) {
  const slug = str(form, "slug");
  const supabase = await createClient();
  await supabase
    .from("pm_department_members")
    .delete()
    .eq("department_id", str(form, "department_id"))
    .eq("user_id", str(form, "user_id"));
  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}?tab=settings`);
}

// --- Demo seed ------------------------------------------------------------

// One-click sample data so the cross-department flow is explorable without
// manual setup. Idempotent-ish: skips creation if departments already exist.
export async function seedDemo() {
  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Personal spaces don't count — the seed checks for real shared departments.
  const { data: existing } = await supabase
    .from("pm_departments")
    .select("id")
    .eq("workspace_id", ws.id)
    .is("deleted_at", null)
    .is("personal_owner_id", null)
    .limit(1);
  if (existing && existing.length > 0) {
    redirect("/teams?error=Es+gibt+bereits+Abteilungen");
  }

  const seed = [
    {
      name: "Marketing",
      slug: "marketing",
      color: "#b45309",
      description: "Content, Kampagnen, Brand und Video-Assets.",
      ai_context:
        "Die Marketing-Abteilung produziert Video-Assets, Landingpages und Kampagnen. Ein einfaches Erklaervideo (60-90 Sek.) dauert in der Regel 2-3 Arbeitstage inkl. Skript, Schnitt und einer Korrekturschleife. Tools: Premiere Pro, Figma, HubSpot. Markenrichtlinien: ruhige Farbwelt, klare Typografie, kein Stockfoto-Look.",
    },
    {
      name: "Sales",
      slug: "sales",
      color: "#1d4ed8",
      description: "Neukundengeschäft, Angebote, CRM-Pflege.",
      ai_context:
        "Sales arbeitet mit HubSpot, fokussiert auf Mittelstand im DACH-Raum. Braucht oft Marketing-Assets fuer Pitches und Messen.",
    },
    {
      name: "Produkt",
      slug: "produkt",
      color: "#15803d",
      description: "Roadmap, Spezifikationen, Feature-Entwicklung.",
      ai_context:
        "Produkt verantwortet die Roadmap und schreibt Spezifikationen. Arbeitet in zweiwoechigen Sprints.",
    },
  ];

  const { data: depts, error } = await supabase
    .from("pm_departments")
    .insert(
      seed.map((d) => ({
        workspace_id: ws.id,
        name: d.name,
        slug: d.slug,
        color: d.color,
        description: d.description,
        ai_context: d.ai_context,
        created_by: user!.id,
      })),
    )
    .select("id, slug");
  if (error || !depts) {
    redirect(`/teams?error=${encodeURIComponent(error?.message ?? "Seed fehlgeschlagen")}`);
  }

  const bySlug: Record<string, string> = {};
  for (const d of depts) bySlug[d.slug] = d.id;

  // Seed a SharePoint folder skeleton per department for the filing demo.
  for (const s of seed) {
    await seedDemoFolders(ws.id, bySlug[s.slug], s.name);
  }

  // Projects inside Marketing — one inherits AI, one has AI switched off to
  // show the per-project override ("leave it as I wrote it").
  const { data: projects } = await supabase
    .from("pm_projects")
    .insert([
      {
        workspace_id: ws.id,
        department_id: bySlug["marketing"],
        name: "Messe Köln 2026",
        description: "Alle Assets und Aufgaben rund um den Messeauftritt.",
        color: "#b45309",
        ai_mode: "inherit",
        created_by: user!.id,
      },
      {
        workspace_id: ws.id,
        department_id: bySlug["marketing"],
        name: "Website Relaunch (KI aus)",
        description: "Texte bleiben wie geschrieben - hier keine KI-Vorschläge.",
        color: "#6b665d",
        ai_mode: "off",
        created_by: user!.id,
      },
    ])
    .select("id, name");
  const messeProject = projects?.find((p) => p.name === "Messe Köln 2026")?.id ?? null;
  const websiteProject =
    projects?.find((p) => p.name.startsWith("Website"))?.id ?? null;

  // A sample cross-department request: Sales asks Marketing for a video.
  const { data: req } = await supabase
    .from("pm_tasks")
    .insert({
      workspace_id: ws.id,
      owner_department_id: bySlug["marketing"],
      requester_department_id: bySlug["sales"],
      project_id: messeProject,
      title: "Erklärvideo für Messeauftritt erstellen",
      description:
        "Wir brauchen ein 60-90 Sekunden Erklärvideo zu unserem neuen Produktmodul für den Messestand in Köln. Zielgruppe: technische Entscheider im Mittelstand. Deadline ist in drei Wochen.",
      status: "backlog",
      priority: "high",
      source: "cross_dept",
      effort_estimate_hours: 16,
      created_by: user!.id,
    })
    .select("id")
    .single();

  // A second cross-department request: Produkt asks Marketing for a one-pager.
  await supabase.from("pm_tasks").insert({
    workspace_id: ws.id,
    owner_department_id: bySlug["marketing"],
    requester_department_id: bySlug["produkt"],
    project_id: messeProject,
    title: "Produkt-One-Pager für Release 4.2 gestalten",
    description:
      "Ein einseitiges PDF mit den drei wichtigsten neuen Funktionen aus Release 4.2 - für Sales und die Messe. Inhalte liefern wir, Gestaltung und Layout von euch.",
    status: "backlog",
    priority: "medium",
    source: "cross_dept",
    effort_estimate_hours: 6,
    created_by: user!.id,
  });

  // Internal Marketing tasks, spread across projects and the board.
  await supabase.from("pm_tasks").insert([
    {
      workspace_id: ws.id,
      owner_department_id: bySlug["marketing"],
      project_id: messeProject,
      title: "Messestand-Grafiken finalisieren",
      status: "in_progress",
      priority: "high",
      source: "internal",
      effort_estimate_hours: 8,
      created_by: user!.id,
    },
    {
      workspace_id: ws.id,
      owner_department_id: bySlug["marketing"],
      project_id: websiteProject,
      title: "Startseiten-Texte überarbeiten",
      status: "todo",
      priority: "low",
      source: "internal",
      created_by: user!.id,
    },
    {
      workspace_id: ws.id,
      owner_department_id: bySlug["marketing"],
      title: "Q3 Kampagnen-Briefing finalisieren",
      status: "review",
      priority: "medium",
      source: "internal",
      created_by: user!.id,
    },
  ]);

  // A couple of knowledge entries so the Wissen tab + filing flow are alive.
  await supabase.from("pm_documents").insert([
    {
      workspace_id: ws.id,
      department_id: bySlug["marketing"],
      project_id: messeProject,
      title: "Kickoff Messe Köln - Notizen",
      kind: "note",
      source: "Teams-Call 12.06.2026",
      content:
        "Zielgruppe: technische Entscheider Mittelstand. Botschaft: weniger Komplexität, schnellere Einführung. Budget für Video: mittel. Termin Messe: in drei Wochen.",
      created_by: user!.id,
    },
    {
      workspace_id: ws.id,
      department_id: bySlug["marketing"],
      title: "Markenrichtlinien Kurzfassung",
      kind: "document",
      content:
        "Ruhige Farbwelt, klare Typografie, kein Stockfoto-Look. Logo immer mit Schutzraum. Tonalität: kompetent, nah, ohne Marketing-Floskeln.",
      created_by: user!.id,
    },
  ]);

  if (req && ws.ai_enabled && ws.ai_auto_briefing) {
    try {
      await runBriefingForTask(req.id);
    } catch {
      // best-effort
    }
  }

  revalidatePath("/teams");
  redirect("/teams/marketing?tab=incoming");
}
