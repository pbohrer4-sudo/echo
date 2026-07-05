import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/pm/workspace";
import { getDepartmentMap } from "@/lib/pm/departments";
import { listCreatedByMe, listMyTasks } from "@/lib/pm/tasks";
import { StatusSelect } from "../_components/status-select";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/pm/types";
import type { PmTask } from "@/lib/pm/types";

export const dynamic = "force-dynamic";

// Wrike "My to-do": every active task assigned to me, across all
// departments, grouped into due-date buckets. Plus "Created by me" below.
export default async function MyTodoPage() {
  const ws = await getOrCreateWorkspace();
  const [myTasks, createdByMe, deptMap] = await Promise.all([
    listMyTasks(ws.id),
    listCreatedByMe(ws.id),
    getDepartmentMap(ws.id),
  ]);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAhead = new Date(now.getTime() + 7 * 86400_000)
    .toISOString()
    .slice(0, 10);

  const buckets: { label: string; tasks: PmTask[] }[] = [
    { label: "Überfällig", tasks: [] },
    { label: "Heute", tasks: [] },
    { label: "Diese Woche", tasks: [] },
    { label: "Später", tasks: [] },
    { label: "Ohne Termin", tasks: [] },
  ];
  for (const t of myTasks) {
    if (!t.due_date) buckets[4].tasks.push(t);
    else if (t.due_date < today) buckets[0].tasks.push(t);
    else if (t.due_date === today) buckets[1].tasks.push(t);
    else if (t.due_date <= weekAhead) buckets[2].tasks.push(t);
    else buckets[3].tasks.push(t);
  }

  const slugOf = (t: PmTask) => deptMap[t.owner_department_id]?.slug ?? "";

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meine Aufgaben</h1>
        <p className="mt-1 text-sm text-ink-3">
          Alles, was dir zugewiesen ist - über alle Abteilungen hinweg,
          gruppiert nach Fälligkeit.
        </p>
      </div>

      {myTasks.length === 0 && (
        <p className="rounded-xl border border-dashed border-rule bg-paper-2 p-6 text-center text-sm text-ink-3">
          Dir ist aktuell nichts zugewiesen. 🎉
        </p>
      )}

      {buckets
        .filter((b) => b.tasks.length > 0)
        .map((b) => (
          <section key={b.label} className="space-y-2">
            <h2
              className={`text-sm font-semibold ${b.label === "Überfällig" ? "text-bad" : ""}`}
            >
              {b.label}{" "}
              <span className="font-normal text-ink-4">({b.tasks.length})</span>
            </h2>
            <ul className="space-y-1.5">
              {b.tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
                >
                  <Link
                    href={`/teams/${slugOf(t)}/tasks/${t.id}`}
                    className="min-w-0 flex-1 truncate hover:text-action"
                  >
                    {t.title}
                    <span className="ml-2 text-xs text-ink-4">
                      {deptMap[t.owner_department_id]?.name ?? "—"} ·{" "}
                      {PRIORITY_LABEL[t.priority]}
                      {t.due_date ? ` · fällig ${t.due_date}` : ""}
                    </span>
                  </Link>
                  <StatusSelect taskId={t.id} slug={slugOf(t)} current={t.status} />
                </li>
              ))}
            </ul>
          </section>
        ))}

      <section className="space-y-2 border-t border-rule pt-6">
        <h2 className="text-sm font-semibold">Von mir erstellt</h2>
        {createdByMe.length === 0 ? (
          <p className="text-sm text-ink-3">Noch keine Aufgaben erstellt.</p>
        ) : (
          <ul className="space-y-1.5">
            {createdByMe.slice(0, 15).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-rule-soft bg-paper px-3 py-2 text-sm"
              >
                <Link
                  href={`/teams/${slugOf(t)}/tasks/${t.id}`}
                  className="min-w-0 flex-1 truncate hover:text-action"
                >
                  {t.title}
                  <span className="ml-2 text-xs text-ink-4">
                    {deptMap[t.owner_department_id]?.name ?? "—"}
                  </span>
                </Link>
                <span className="text-xs text-ink-4">
                  {TASK_STATUS_LABEL[t.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
