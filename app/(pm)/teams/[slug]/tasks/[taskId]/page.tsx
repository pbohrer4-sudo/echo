import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateWorkspace } from "@/lib/pm/workspace";
import { getDepartmentBySlug, getDepartmentMap } from "@/lib/pm/departments";
import {
  getLatestBriefing,
  getTask,
  listComments,
  listDependencies,
  listReminders,
} from "@/lib/pm/tasks";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/pm/types";
import { StatusSelect } from "../../../_components/status-select";
import {
  addComment,
  addReminder,
  decideBriefing,
  runBriefing,
  updateTaskDetails,
} from "../../../actions";

export const dynamic = "force-dynamic";

export default async function TaskDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; taskId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, taskId } = await params;
  const { error } = await searchParams;

  const ws = await getOrCreateWorkspace();
  const dept = await getDepartmentBySlug(ws.id, slug);
  if (!dept) notFound();

  const task = await getTask(taskId);
  if (!task) notFound();

  const [deptMap, briefing, deps, reminders, comments] = await Promise.all([
    getDepartmentMap(ws.id),
    getLatestBriefing(task.id),
    listDependencies(task.id),
    listReminders(task.id),
    listComments(task.id),
  ]);

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

      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
        <StatusSelect
          taskId={task.id}
          slug={slug}
          current={task.status}
          redirectTo={detailPath}
        />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge>{TASK_STATUS_LABEL[task.status]}</Badge>
        <Badge>Priorität: {PRIORITY_LABEL[task.priority]}</Badge>
        {isCrossDept && (
          <Badge>
            {deptMap[task.requester_department_id ?? ""]?.name ?? "—"} →{" "}
            {deptMap[task.owner_department_id]?.name ?? "—"}
          </Badge>
        )}
        {task.accepted_into_sprint && <Badge>im Sprint</Badge>}
      </div>

      {task.description && (
        <div className="rounded-xl border border-rule bg-paper p-4">
          <p className="whitespace-pre-wrap text-sm text-ink-2">
            {task.description}
          </p>
        </div>
      )}

      {/* AI briefing — only for cross-department requests, and only when AI
          is enabled for the workspace. */}
      {isCrossDept && ws.ai_enabled && (
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
                <span className="text-ink-3">Termin</span>
                <input
                  name="due_date"
                  type="date"
                  defaultValue={task.due_date ?? ""}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2"
                />
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

          {deps.length > 0 && (
            <div className="mt-4 border-t border-rule pt-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-4">
                Abhängig von
              </p>
              <ul className="space-y-1 text-sm">
                {deps.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/teams/${slug}/tasks/${d.id}`}
                      className="text-ink-2 hover:text-action"
                    >
                      {d.title}{" "}
                      <span className="text-xs text-ink-4">
                        ({TASK_STATUS_LABEL[d.status]})
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
