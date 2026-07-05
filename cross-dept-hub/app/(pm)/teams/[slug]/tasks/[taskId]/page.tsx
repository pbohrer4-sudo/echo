import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateWorkspace, listWorkspaceMembers } from "@/lib/pm/workspace";
import { getDepartmentBySlug, getDepartmentMap } from "@/lib/pm/departments";
import {
  getLatestBriefing,
  getTask,
  listBoardTasks,
  listComments,
  listDependencies,
  listReminders,
} from "@/lib/pm/tasks";
import { isAiEnabledForTask, listProjects } from "@/lib/pm/projects";
import {
  getItemType,
  listFoldersForDepartment,
  listItemTypes,
  listSubtasks,
  listTaskLocations,
} from "@/lib/pm/structure";
import { listTimeEntries, sumHours } from "@/lib/pm/workload";
import { listApprovalsForTask } from "@/lib/pm/approvals";
import {
  APPROVAL_STATUS_LABEL,
  DEPENDENCY_TYPE_LABEL,
  durationDays,
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/pm/types";
import { StatusSelect } from "../../../_components/status-select";
import {
  addComment,
  addCrossTag,
  addDependency,
  addReminder,
  addSubtask,
  createBlueprintFromTask,
  decideApproval,
  decideBriefing,
  logTime,
  removeCrossTag,
  removeDependency,
  requestApproval,
  runBriefing,
  saveCustomFields,
  updateTaskDetails,
} from "../../../actions";

export const dynamic = "force-dynamic";

export default async function TaskDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; taskId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { slug, taskId } = await params;
  const { error, saved } = await searchParams;

  const ws = await getOrCreateWorkspace();
  const dept = await getDepartmentBySlug(ws.id, slug);
  if (!dept) notFound();

  const task = await getTask(taskId);
  if (!task) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    deptMap,
    briefing,
    deps,
    reminders,
    comments,
    projects,
    aiEnabled,
    subtasks,
    locations,
    timeEntries,
    approvals,
    members,
    folders,
    itemTypes,
  ] = await Promise.all([
    getDepartmentMap(ws.id),
    getLatestBriefing(task.id),
    listDependencies(task.id),
    listReminders(task.id),
    listComments(task.id),
    listProjects(task.owner_department_id),
    isAiEnabledForTask(task),
    listSubtasks(task.id),
    listTaskLocations(task.id),
    listTimeEntries(task.id),
    listApprovalsForTask(task.id),
    listWorkspaceMembers(ws.id),
    listFoldersForDepartment(task.owner_department_id),
    listItemTypes(ws.id),
  ]);
  const itemType = task.item_type_id ? await getItemType(task.item_type_id) : null;
  // Candidates for the dependency picker: the department's other tasks.
  const deptTasks = (await listBoardTasks(task.owner_department_id)).filter(
    (t) =>
      t.id !== task.id && !deps.some((d) => d.task.id === t.id),
  );
  const plannedDuration = durationDays(task.start_date, task.due_date);

  const memberName = (id: string | null) => {
    if (!id) return "—";
    const m = members.find((x) => x.user_id === id);
    return m?.display_name || id.slice(0, 8);
  };

  const isCrossDept = task.source === "cross_dept";
  const detailPath = `/teams/${slug}/tasks/${task.id}`;

  return (
    <div className="space-y-6">
      <div className="text-sm text-ink-4">
        <Link href={`/teams/${slug}`} className="hover:text-ink-1">
          {dept.name}
        </Link>
        <span className="mx-1">/</span>
        <span>Aufgabe</span>
      </div>

      {error && (
        <p className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg border border-good/40 bg-good/5 px-3 py-2 text-sm text-ink-2">
          {saved}
        </p>
      )}

      {task.parent_task_id && (
        <p className="text-xs text-ink-4">
          Unteraufgabe von{" "}
          <Link
            href={`/teams/${slug}/tasks/${task.parent_task_id}`}
            className="underline hover:text-action"
          >
            übergeordneter Aufgabe
          </Link>
        </p>
      )}

      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {itemType ? `${itemType.icon} ` : ""}
          {task.title}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <form action={createBlueprintFromTask}>
            <input type="hidden" name="task_id" value={task.id} />
            <input type="hidden" name="slug" value={slug} />
            <button
              type="submit"
              className="rounded-lg border border-rule px-2.5 py-1.5 text-xs text-ink-3 hover:border-action hover:text-ink-1"
              title="Aufgabe inkl. Unteraufgaben als wiederverwendbare Vorlage speichern"
            >
              Als Vorlage speichern
            </button>
          </form>
          <StatusSelect
            taskId={task.id}
            slug={slug}
            current={task.status}
            redirectTo={detailPath}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge>{TASK_STATUS_LABEL[task.status]}</Badge>
        <Badge>Priorität: {PRIORITY_LABEL[task.priority]}</Badge>
        {itemType && (
          <Badge>
            Typ: {itemType.icon} {itemType.name}
          </Badge>
        )}
        {isCrossDept && (
          <Badge>
            {deptMap[task.requester_department_id ?? ""]?.name ?? "—"} →{" "}
            {deptMap[task.owner_department_id]?.name ?? "—"}
          </Badge>
        )}
        {task.assignee_id && <Badge>Zugewiesen: {memberName(task.assignee_id)}</Badge>}
        {task.start_date && task.due_date && (
          <Badge>
            {task.start_date} → {task.due_date}
            {plannedDuration ? ` (${plannedDuration}d)` : ""}
          </Badge>
        )}
        {task.accepted_into_sprint && <Badge>im Sprint</Badge>}
        <Badge>KI: {aiEnabled ? "aktiv" : "aus"}</Badge>
      </div>

      {task.description && (
        <div className="rounded-xl border border-rule bg-paper p-4">
          <p className="whitespace-pre-wrap text-sm text-ink-2">
            {task.description}
          </p>
        </div>
      )}

      {/* AI briefing — only for cross-department requests, and only when AI
          is effectively enabled for this task (task → project → workspace). */}
      {isCrossDept && aiEnabled && (
        <section className="rounded-xl border border-rule bg-paper-2 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">KI-Briefing</h2>
            <form action={runBriefing}>
              <input type="hidden" name="task_id" value={task.id} />
              <input type="hidden" name="slug" value={slug} />
              <button
                type="submit"
                className="rounded-lg border border-rule bg-paper px-2.5 py-1.5 text-xs font-medium hover:border-action"
              >
                {briefing ? "Neu generieren" : "Briefing erstellen"}
              </button>
            </form>
          </div>

          {!briefing && (
            <p className="mt-3 text-sm text-ink-3">
              Noch kein Briefing. Der KI-Agent liest den Kontext und das Wissen
              der Abteilung {"„"}
            {dept.name}
            {"“"} und erstellt ein Briefing plus
              Antwortentwurf.
            </p>
          )}

          {briefing && (
            <div className="mt-3 space-y-3 text-sm">
              <p className="font-medium text-ink-1">{briefing.summary}</p>

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-4">
                  Briefing
                </p>
                <p className="whitespace-pre-wrap text-ink-2">
                  {briefing.briefing}
                </p>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-4">
                  Antwortentwurf an{" "}
                  {deptMap[task.requester_department_id ?? ""]?.name ?? "die Abteilung"}
                </p>
                <p className="whitespace-pre-wrap rounded-lg border border-rule bg-paper p-3 text-ink-2">
                  {briefing.suggested_response}
                </p>
              </div>

              {briefing.open_questions.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-4">
                    Offene Fragen
                  </p>
                  <ul className="list-inside list-disc text-ink-2">
                    {briefing.open_questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs text-ink-4">
                <span>
                  Aufwand-Schätzung:{" "}
                  <strong className="text-ink-2">
                    {briefing.estimated_hours != null
                      ? `${briefing.estimated_hours} h`
                      : "—"}
                  </strong>
                </span>
                <span>Modell: {briefing.model}</span>
                <span>Status: {briefing.status}</span>
              </div>

              {briefing.reasoning && (
                <details className="text-xs text-ink-4">
                  <summary className="cursor-pointer">Begründung anzeigen</summary>
                  <p className="mt-1 whitespace-pre-wrap">{briefing.reasoning}</p>
                </details>
              )}

              {briefing.status === "pending" && (
                <div className="flex gap-2 pt-1">
                  <form action={decideBriefing}>
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="briefing_id" value={briefing.id} />
                    <input type="hidden" name="decision" value="accept" />
                    <button
                      type="submit"
                      className="rounded-lg bg-action px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90"
                    >
                      Übernehmen (Antwort posten)
                    </button>
                  </form>
                  <form action={decideBriefing}>
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="briefing_id" value={briefing.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <button
                      type="submit"
                      className="rounded-lg border border-rule px-3 py-1.5 text-xs font-medium hover:border-bad hover:text-bad"
                    >
                      Ablehnen
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Details edit */}
        <section className="rounded-xl border border-rule bg-paper p-4">
          <h2 className="mb-3 text-sm font-semibold">Details</h2>
          <form action={updateTaskDetails} className="grid gap-3 text-sm">
            <input type="hidden" name="task_id" value={task.id} />
            <input type="hidden" name="slug" value={slug} />
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="text-ink-3">Aufwand (h)</span>
                <input
                  name="effort_estimate_hours"
                  type="number"
                  min="0"
                  step="0.5"
                  defaultValue={task.effort_estimate_hours ?? ""}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                />
              </label>
              <label>
                <span className="text-ink-3">Priorität</span>
                <select
                  name="priority"
                  defaultValue={task.priority}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  <option value="low">Niedrig</option>
                  <option value="medium">Mittel</option>
                  <option value="high">Hoch</option>
                  <option value="urgent">Dringend</option>
                </select>
              </label>
              <label>
                <span className="text-ink-3">Sprint</span>
                <input
                  name="sprint"
                  defaultValue={task.sprint ?? ""}
                  placeholder="z.B. Sprint 24"
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                />
              </label>
              <label>
                <span className="text-ink-3">Start</span>
                <input
                  name="start_date"
                  type="date"
                  defaultValue={task.start_date ?? ""}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                />
              </label>
              <label>
                <span className="text-ink-3">Fällig</span>
                <input
                  name="due_date"
                  type="date"
                  defaultValue={task.due_date ?? ""}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                />
              </label>
              <label>
                <span className="text-ink-3">Zugewiesen an</span>
                <select
                  name="assignee_id"
                  defaultValue={task.assignee_id ?? ""}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  <option value="">Nicht zugewiesen</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.user_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-ink-3">Ordner</span>
                <select
                  name="folder_id"
                  defaultValue={task.folder_id ?? ""}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  <option value="">Kein Ordner</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-ink-3">Vorgangstyp</span>
                <select
                  name="item_type_id"
                  defaultValue={task.item_type_id ?? ""}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  <option value="">Aufgabe (Standard)</option>
                  {itemTypes.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.icon} {it.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-ink-3">Projekt</span>
                <select
                  name="project_id"
                  defaultValue={task.project_id ?? ""}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  <option value="">Kein Projekt</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-ink-3">KI-Modus</span>
                <select
                  name="ai_mode"
                  defaultValue={task.ai_mode}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                >
                  <option value="inherit">Erbt (Projekt/Workspace)</option>
                  <option value="on">An</option>
                  <option value="off">Aus</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <label>
                <span className="text-ink-3">
                  Dauer (Tage) - überschreibt das Fälligkeitsdatum
                </span>
                <input
                  name="duration_days"
                  type="number"
                  min="1"
                  placeholder={plannedDuration ? `aktuell ${plannedDuration}d` : "z.B. 5"}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                />
              </label>
              <label className="flex items-center gap-2 pb-2 text-ink-3">
                <input type="checkbox" name="working_days_only" defaultChecked />
                Nur Arbeitstage
              </label>
            </div>
            <label className="flex items-center gap-2 text-ink-3">
              <input
                type="checkbox"
                name="accepted_into_sprint"
                defaultChecked={task.accepted_into_sprint}
              />
              In nächsten Sprint übernehmen
            </label>
            <button
              type="submit"
              className="justify-self-start rounded-lg bg-action px-3 py-2 text-xs font-medium text-paper hover:opacity-90"
            >
              Speichern
            </button>
          </form>

          <div className="mt-4 border-t border-rule pt-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-4">
              Abhängig von
            </p>
            {deps.length > 0 && (
              <ul className="mb-2 space-y-1 text-sm">
                {deps.map((d) => (
                  <li key={d.task.id} className="flex items-center justify-between">
                    <Link
                      href={`/teams/${slug}/tasks/${d.task.id}`}
                      className="text-ink-2 hover:text-action"
                    >
                      {d.task.title}{" "}
                      <span className="text-xs text-ink-4">
                        ({TASK_STATUS_LABEL[d.task.status]} · {DEPENDENCY_TYPE_LABEL[d.type]})
                      </span>
                    </Link>
                    <form action={removeDependency}>
                      <input type="hidden" name="task_id" value={task.id} />
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="depends_on_task_id" value={d.task.id} />
                      <button type="submit" className="text-xs text-ink-4 hover:text-bad">
                        Entfernen
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {deptTasks.length > 0 && (
              <form action={addDependency} className="flex gap-2 text-sm">
                <input type="hidden" name="task_id" value={task.id} />
                <input type="hidden" name="slug" value={slug} />
                <select
                  name="depends_on_task_id"
                  required
                  className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-2 py-1.5 text-xs"
                >
                  {deptTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
                <select
                  name="dependency_type"
                  defaultValue="FS"
                  className="rounded-lg border border-rule bg-paper px-2 py-1.5 text-xs"
                  title="Abhängigkeitstyp (Wrike: FS/SS/FF/SF)"
                >
                  {(["FS", "SS", "FF", "SF"] as const).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-lg border border-rule px-2 py-1.5 text-xs font-medium hover:border-action"
                >
                  + Vorgänger
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Reminders */}
        <section className="rounded-xl border border-rule bg-paper p-4">
          <h2 className="mb-3 text-sm font-semibold">Erinnerungen</h2>
          {reminders.length === 0 ? (
            <p className="text-sm text-ink-3">Keine Erinnerungen.</p>
          ) : (
            <ul className="mb-3 space-y-1 text-sm">
              {reminders.map((r) => (
                <li key={r.id} className="flex justify-between text-ink-2">
                  <span>{r.reason}</span>
                  <span className="text-xs text-ink-4">
                    {new Date(r.remind_at).toLocaleString("de-DE")} · {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form action={addReminder} className="grid gap-2 text-sm">
            <input type="hidden" name="task_id" value={task.id} />
            <input type="hidden" name="slug" value={slug} />
            <input
              name="reason"
              placeholder="Grund (z.B. Nachfassen)"
              className="rounded-lg border border-rule bg-paper px-3 py-2"
            />
            <div className="flex gap-2">
              <input
                name="remind_at"
                type="datetime-local"
                required
                className="flex-1 rounded-lg border border-rule bg-paper px-3 py-2"
              />
              <button
                type="submit"
                className="rounded-lg border border-rule px-3 py-2 text-xs font-medium hover:border-action"
              >
                + Erinnerung
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Subtasks */}
      {!task.parent_task_id && (
        <section className="rounded-xl border border-rule bg-paper p-4">
          <h2 className="mb-3 text-sm font-semibold">
            Unteraufgaben{" "}
            {subtasks.length > 0 && (
              <span className="font-normal text-ink-4">
                (
                {subtasks.filter((s) => s.status === "done" || s.status === "archived").length}
                /{subtasks.length} erledigt)
              </span>
            )}
          </h2>
          {subtasks.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {subtasks.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-rule-soft px-3 py-2 text-sm"
                >
                  <Link
                    href={`/teams/${slug}/tasks/${s.id}`}
                    className={`hover:text-action ${s.status === "done" ? "text-ink-4 line-through" : "text-ink-2"}`}
                  >
                    {s.title}
                  </Link>
                  <StatusSelect
                    taskId={s.id}
                    slug={slug}
                    current={s.status}
                    redirectTo={detailPath}
                  />
                </li>
              ))}
            </ul>
          )}
          <form action={addSubtask} className="flex gap-2">
            <input type="hidden" name="parent_task_id" value={task.id} />
            <input type="hidden" name="slug" value={slug} />
            <input
              name="title"
              placeholder="Neue Unteraufgabe…"
              className="flex-1 rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg border border-rule px-3 py-2 text-xs font-medium hover:border-action"
            >
              + Hinzufügen
            </button>
          </form>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Custom fields from the item type */}
        {itemType && itemType.fields.length > 0 && (
          <section className="rounded-xl border border-rule bg-paper p-4">
            <h2 className="mb-3 text-sm font-semibold">
              {itemType.icon} {itemType.name}-Felder
            </h2>
            <form action={saveCustomFields} className="grid gap-3 text-sm">
              <input type="hidden" name="task_id" value={task.id} />
              <input type="hidden" name="slug" value={slug} />
              {itemType.fields.map((f) => (
                <label key={f.key}>
                  <span className="text-ink-3">{f.label}</span>
                  {f.type === "select" ? (
                    <select
                      name={`cf_${f.key}`}
                      defaultValue={task.custom_fields?.[f.key] ?? ""}
                      className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                    >
                      <option value="">—</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name={`cf_${f.key}`}
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      defaultValue={task.custom_fields?.[f.key] ?? ""}
                      className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                    />
                  )}
                </label>
              ))}
              <button
                type="submit"
                className="justify-self-start rounded-lg bg-action px-3 py-2 text-xs font-medium text-paper hover:opacity-90"
              >
                Felder speichern
              </button>
            </form>
          </section>
        )}

        {/* Cross-tagging */}
        <section className="rounded-xl border border-rule bg-paper p-4">
          <h2 className="mb-1 text-sm font-semibold">Cross-Tagging</h2>
          <p className="mb-3 text-xs text-ink-4">
            Die Aufgabe erscheint zusätzlich in den Ansichten dieser
            Abteilungen - dieselbe Aufgabe, keine Kopie. Statusänderungen sind
            überall sofort sichtbar.
          </p>
          {locations.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {locations.map((l) => (
                <li
                  key={l.department_id}
                  className="flex items-center justify-between rounded-lg border border-rule-soft px-3 py-2 text-sm"
                >
                  <span>⇄ {deptMap[l.department_id]?.name ?? "—"}</span>
                  <form action={removeCrossTag}>
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="department_id" value={l.department_id} />
                    <button type="submit" className="text-xs text-ink-4 hover:text-bad">
                      Entfernen
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={addCrossTag} className="flex gap-2">
            <input type="hidden" name="task_id" value={task.id} />
            <input type="hidden" name="slug" value={slug} />
            <select
              name="department_id"
              required
              className="flex-1 rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              {Object.values(deptMap)
                .filter(
                  (d) =>
                    d.id !== task.owner_department_id &&
                    !locations.some((l) => l.department_id === d.id),
                )
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-rule px-3 py-2 text-xs font-medium hover:border-action"
            >
              + Cross-Tag
            </button>
          </form>
        </section>

        {/* Timesheet */}
        <section className="rounded-xl border border-rule bg-paper p-4">
          <h2 className="mb-3 text-sm font-semibold">
            Zeiterfassung{" "}
            <span className="font-normal text-ink-4">
              ({sumHours(timeEntries)}h erfasst
              {task.effort_estimate_hours
                ? ` / ${task.effort_estimate_hours}h geschätzt`
                : ""}
              )
            </span>
          </h2>
          {timeEntries.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">
              {timeEntries.map((e) => (
                <li key={e.id} className="flex justify-between text-ink-2">
                  <span>
                    {e.hours}h · {memberName(e.user_id)}
                    {e.note ? ` - ${e.note}` : ""}
                  </span>
                  <span className="text-xs text-ink-4">{e.entry_date}</span>
                </li>
              ))}
            </ul>
          )}
          <form action={logTime} className="grid grid-cols-[80px_1fr_auto] gap-2 text-sm">
            <input type="hidden" name="task_id" value={task.id} />
            <input type="hidden" name="slug" value={slug} />
            <input
              name="hours"
              type="number"
              min="0.25"
              step="0.25"
              required
              placeholder="Std."
              className="rounded-lg border border-rule bg-paper px-3 py-2"
            />
            <input
              name="note"
              placeholder="Notiz (optional)"
              className="rounded-lg border border-rule bg-paper px-3 py-2"
            />
            <button
              type="submit"
              className="rounded-lg border border-rule px-3 py-2 text-xs font-medium hover:border-action"
            >
              + Erfassen
            </button>
          </form>
        </section>

        {/* Approvals */}
        <section className="rounded-xl border border-rule bg-paper p-4">
          <h2 className="mb-1 text-sm font-semibold">Freigaben</h2>
          <p className="mb-3 text-xs text-ink-4">
            Formalisierte Abnahme mit Nachweis: wer hat wann was entschieden.
          </p>
          {approvals.length > 0 && (
            <ul className="mb-3 space-y-1.5 text-sm">
              {approvals.map((a) => (
                <li key={a.id} className="rounded-lg border border-rule-soft px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span>
                      {memberName(a.approver_id)} ·{" "}
                      <span
                        className={
                          a.status === "approved"
                            ? "text-good"
                            : a.status === "rejected"
                              ? "text-bad"
                              : "text-ink-3"
                        }
                      >
                        {APPROVAL_STATUS_LABEL[a.status]}
                      </span>
                    </span>
                    <span className="text-xs text-ink-4">
                      {a.decided_at
                        ? new Date(a.decided_at).toLocaleString("de-DE")
                        : `angefragt ${new Date(a.created_at).toLocaleDateString("de-DE")}`}
                    </span>
                  </div>
                  {a.note && <p className="mt-1 text-xs text-ink-4">Anfrage: {a.note}</p>}
                  {a.decision_comment && (
                    <p className="mt-1 text-xs text-ink-4">Kommentar: {a.decision_comment}</p>
                  )}
                  {a.status === "pending" && a.approver_id === user?.id && (
                    <div className="mt-2 flex gap-2">
                      <form action={decideApproval}>
                        <input type="hidden" name="approval_id" value={a.id} />
                        <input type="hidden" name="task_id" value={task.id} />
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="decision" value="approved" />
                        <button
                          type="submit"
                          className="rounded-lg bg-action px-2.5 py-1 text-xs font-medium text-paper hover:opacity-90"
                        >
                          Freigeben
                        </button>
                      </form>
                      <form action={decideApproval}>
                        <input type="hidden" name="approval_id" value={a.id} />
                        <input type="hidden" name="task_id" value={task.id} />
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="decision" value="rejected" />
                        <button
                          type="submit"
                          className="rounded-lg border border-rule px-2.5 py-1 text-xs font-medium hover:border-bad hover:text-bad"
                        >
                          Ablehnen
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form action={requestApproval} className="grid gap-2 text-sm">
            <input type="hidden" name="task_id" value={task.id} />
            <input type="hidden" name="slug" value={slug} />
            <div className="flex gap-2">
              <select
                name="approver_id"
                required
                className="flex-1 rounded-lg border border-rule bg-paper px-3 py-2"
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name || m.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg border border-rule px-3 py-2 text-xs font-medium hover:border-action"
              >
                + Freigabe anfragen
              </button>
            </div>
            <input
              name="note"
              placeholder="Worum geht es? (optional)"
              className="rounded-lg border border-rule bg-paper px-3 py-2"
            />
          </form>
        </section>
      </div>

      {/* Activity / comments */}
      <section className="rounded-xl border border-rule bg-paper p-4">
        <h2 className="mb-3 text-sm font-semibold">Verlauf & Kommentare</h2>
        <div className="space-y-2">
          {comments.length === 0 && (
            <p className="text-sm text-ink-3">Noch keine Einträge.</p>
          )}
          {comments.map((c) => (
            <div
              key={c.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                c.is_system
                  ? "border-rule-soft bg-paper-2 text-ink-3"
                  : "border-rule bg-paper text-ink-2"
              }`}
            >
              <p className="whitespace-pre-wrap">{c.body}</p>
              <p className="mt-1 text-[11px] text-ink-4">
                {c.is_system ? "System" : "Kommentar"} ·{" "}
                {new Date(c.created_at).toLocaleString("de-DE")}
              </p>
            </div>
          ))}
        </div>
        <form action={addComment} className="mt-3 flex gap-2">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="slug" value={slug} />
          <input
            name="body"
            placeholder="Kommentar schreiben…"
            className="flex-1 rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-action px-3 py-2 text-sm font-medium text-paper hover:opacity-90"
          >
            Senden
          </button>
        </form>
      </section>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-paper-2 px-2 py-0.5 text-ink-3">
      {children}
    </span>
  );
}
