import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/pm/workspace";
import { getDepartmentMap } from "@/lib/pm/departments";
import { getProjectMap } from "@/lib/pm/projects";
import {
  computeProjectRisks,
  computeStats,
  listWorkspaceTasks,
} from "@/lib/pm/reporting";
import { departmentWorkload } from "@/lib/pm/workload";
import { listMyPendingApprovals } from "@/lib/pm/approvals";
import { TASK_STATUS_LABEL, type PmTaskStatus } from "@/lib/pm/types";

export const dynamic = "force-dynamic";

const STAT_STATUSES: PmTaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
];

// Workspace dashboard: status widgets, deadlines, workload, project risk.
// The risk flag is a deterministic pacing heuristic and labeled as such.
export default async function DashboardPage() {
  const ws = await getOrCreateWorkspace();
  const tasks = await listWorkspaceTasks(ws.id);
  const [deptMap, projectMap, workload, pendingApprovals] = await Promise.all([
    getDepartmentMap(ws.id),
    getProjectMap(ws.id),
    departmentWorkload(ws.id, tasks),
    listMyPendingApprovals(),
  ]);

  const stats = computeStats(tasks);
  const risks = computeProjectRisks(tasks);
  const riskyProjects = Object.values(risks).filter((r) => r.level !== "on_track");
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = tasks
    .filter(
      (t) =>
        t.status !== "done" &&
        t.status !== "archived" &&
        t.due_date &&
        t.due_date < today,
    )
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-3">
            Alle Abteilungen auf einen Blick.
          </p>
        </div>
        <a
          href="/api/pm/reports/tasks"
          className="rounded-lg border border-rule px-3 py-1.5 text-sm text-ink-3 hover:border-action hover:text-ink-1"
        >
          CSV-Report ↓
        </a>
      </div>

      {/* Status widgets */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {STAT_STATUSES.map((s) => (
          <div key={s} className="rounded-xl border border-rule bg-paper p-4">
            <p className="text-2xl font-semibold">{stats.byStatus[s]}</p>
            <p className="mt-0.5 text-xs text-ink-4">{TASK_STATUS_LABEL[s]}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard value={stats.openTotal} label="Offen gesamt" />
        <StatCard
          value={stats.overdue}
          label="Überfällig"
          tone={stats.overdue > 0 ? "bad" : undefined}
        />
        <StatCard value={stats.dueThisWeek} label="Fällig diese Woche" />
        <StatCard value={stats.doneLast30} label="Erledigt (30 Tage)" />
      </div>

      {/* Pending approvals for me */}
      {pendingApprovals.length > 0 && (
        <section className="rounded-xl border border-signal/50 bg-signal-soft p-4">
          <h2 className="text-sm font-semibold">
            Freigaben, die auf dich warten ({pendingApprovals.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {pendingApprovals.map((a) => {
              const task = tasks.find((t) => t.id === a.task_id);
              const dept = task ? deptMap[task.owner_department_id] : null;
              return (
                <li key={a.id}>
                  {task && dept ? (
                    <Link
                      href={`/teams/${dept.slug}/tasks/${task.id}`}
                      className="underline hover:text-action"
                    >
                      {task.title}
                    </Link>
                  ) : (
                    "Aufgabe"
                  )}
                  {a.note && <span className="text-ink-3"> - {a.note}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Project risk (heuristic) */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Projekt-Risiko{" "}
          <span className="font-normal text-ink-4">
            (Heuristik: Tempo vs. Restzeit - keine KI-Prognose)
          </span>
        </h2>
        {riskyProjects.length === 0 ? (
          <p className="text-sm text-ink-3">
            Kein Projekt ist überfällig oder in Verzug.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {riskyProjects.map((r) => {
              const project = projectMap[r.projectId];
              const dept = project ? deptMap[project.department_id] : null;
              return (
                <li
                  key={r.projectId}
                  className="flex items-center justify-between rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
                >
                  <span>
                    <span
                      className={`mr-2 inline-block h-2 w-2 rounded-full ${r.level === "overdue" ? "bg-bad" : "bg-warn"}`}
                    />
                    {project?.name ?? "Projekt"}
                    {dept && (
                      <Link
                        href={`/teams/${dept.slug}?tab=projects`}
                        className="ml-2 text-xs text-ink-4 underline hover:text-action"
                      >
                        {dept.name}
                      </Link>
                    )}
                  </span>
                  <span className="text-xs text-ink-4">{r.reason}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Overdue list */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Überfällige Aufgaben</h2>
        {overdueTasks.length === 0 ? (
          <p className="text-sm text-ink-3">Nichts überfällig. 🎉</p>
        ) : (
          <ul className="space-y-1.5">
            {overdueTasks.map((t) => {
              const dept = deptMap[t.owner_department_id];
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
                >
                  <Link
                    href={dept ? `/teams/${dept.slug}/tasks/${t.id}` : "/teams"}
                    className="hover:text-action"
                  >
                    {t.title}
                    <span className="ml-2 text-xs text-ink-4">
                      {dept?.name ?? "—"}
                    </span>
                  </Link>
                  <span className="text-xs font-medium text-bad">
                    fällig {t.due_date}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Workload across the workspace */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Auslastung (Workspace)</h2>
        <div className="space-y-2 rounded-xl border border-rule bg-paper p-4">
          {workload
            .filter((w) => w.open_tasks > 0)
            .map((w) => (
              <div
                key={w.user_id ?? "unassigned"}
                className="flex items-baseline justify-between text-sm"
              >
                <span className={w.user_id ? "" : "italic text-ink-3"}>
                  {w.display_name}
                </span>
                <span className="text-xs text-ink-4">
                  {w.open_tasks} offen · {w.estimated_hours}h geschätzt ·{" "}
                  {w.logged_hours}h erfasst
                </span>
              </div>
            ))}
          {workload.every((w) => w.open_tasks === 0) && (
            <p className="text-sm text-ink-3">Keine offenen Aufgaben.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "bad";
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${tone === "bad" && value > 0 ? "border-bad/50 bg-bad/5" : "border-rule bg-paper"}`}
    >
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-0.5 text-xs text-ink-4">{label}</p>
    </div>
  );
}
