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
import {
  TASK_STATUS_LABEL,
  type PmDocKind,
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
  "archived",
]);
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

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
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

// --- Internal tasks -------------------------------------------------------

export async function createInternalTask(form: FormData) {
  const slug = str(form, "slug");
  const departmentId = str(form, "department_id");
  const title = str(form, "title");
  if (!title) redirect(`/teams/${slug}?error=Titel+erforderlich`);

  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const priority = str(form, "priority") as PmTaskPriority;
  const { error } = await supabase.from("pm_tasks").insert({
    workspace_id: ws.id,
    owner_department_id: departmentId,
    title,
    description: str(form, "description") || null,
    status: "backlog",
    priority: VALID_PRIORITY.has(priority) ? priority : "medium",
    source: "internal",
    effort_estimate_hours: numOrNull(form, "effort_estimate_hours"),
    due_date: str(form, "due_date") || null,
    created_by: user!.id,
  });
  if (error) redirect(`/teams/${slug}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/teams/${slug}`);
  redirect(`/teams/${slug}`);
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

  const update: Record<string, unknown> = {
    effort_estimate_hours: numOrNull(form, "effort_estimate_hours"),
    sprint: str(form, "sprint") || null,
    due_date: str(form, "due_date") || null,
    accepted_into_sprint: form.get("accepted_into_sprint") === "on",
  };
  const priority = str(form, "priority") as PmTaskPriority;
  if (VALID_PRIORITY.has(priority)) update.priority = priority;

  const { error } = await supabase.from("pm_tasks").update(update).eq("id", taskId);
  if (error) {
    redirect(`/teams/${slug}/tasks/${taskId}?error=${encodeURIComponent(error.message)}`);
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
  // when the receiving department opens its inbox — but only if AI is enabled
  // for the workspace and the requester left the per-request toggle on.
  // Best-effort: if the AI call fails the request is still created.
  if (ws.ai_enabled && form.get("auto_brief") === "on") {
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
  const ws = await getOrCreateWorkspace();
  if (!ws.ai_enabled) {
    redirect(`/teams/${slug}/tasks/${taskId}?error=KI+ist+deaktiviert`);
  }
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

  // Ping the involved departments (in-app + browser, no email per comment).
  const task = await getTask(taskId);
  if (task) {
    const deptIds = [task.owner_department_id, task.requester_department_id].filter(
      (id): id is string => Boolean(id),
    );
    const recipientLists = await Promise.all(
      deptIds.map((id) => resolveDepartmentRecipients(id, ws.id)),
    );
    const recipients = recipientLists.flat().filter((r) => r.user_id !== user!.id);
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
  // AI and auto-filing are enabled for the workspace. Off → the document is
  // kept exactly as entered (the user can still request a suggestion later).
  // Best-effort: the document is saved regardless.
  if (ws.ai_enabled && ws.ai_auto_filing) {
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
  const ws = await getOrCreateWorkspace();
  if (!ws.ai_enabled) {
    redirect(`/teams/${slug}?tab=knowledge&error=KI+ist+deaktiviert`);
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

// --- Demo seed ------------------------------------------------------------

// One-click sample data so the cross-department flow is explorable without
// manual setup. Idempotent-ish: skips creation if departments already exist.
export async function seedDemo() {
  const supabase = await createClient();
  const ws = await getOrCreateWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existing } = await supabase
    .from("pm_departments")
    .select("id")
    .eq("workspace_id", ws.id)
    .is("deleted_at", null)
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

  // A sample cross-department request: Sales asks Marketing for a video.
  const { data: req } = await supabase
    .from("pm_tasks")
    .insert({
      workspace_id: ws.id,
      owner_department_id: bySlug["marketing"],
      requester_department_id: bySlug["sales"],
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

  // Some internal Marketing tasks for the board.
  await supabase.from("pm_tasks").insert([
    {
      workspace_id: ws.id,
      owner_department_id: bySlug["marketing"],
      title: "Q3 Kampagnen-Briefing finalisieren",
      status: "in_progress",
      priority: "medium",
      source: "internal",
      created_by: user!.id,
    },
    {
      workspace_id: ws.id,
      owner_department_id: bySlug["marketing"],
      title: "Landingpage-Texte überarbeiten",
      status: "todo",
      priority: "low",
      source: "internal",
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
