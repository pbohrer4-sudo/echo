import Link from "next/link";
import { StatusSelect } from "../../_components/status-select";
import {
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/pm/types";
import type { PmFolder, PmItemType, PmTask } from "@/lib/pm/types";

// Spreadsheet-style list of a department's tasks, grouped by folder. Status
// is inline-editable; everything else links to the task detail.
export function ListView({
  slug,
  tasks,
  folders,
  itemTypes,
  loggedHours,
  assigneeNames,
}: {
  slug: string;
  tasks: PmTask[];
  folders: PmFolder[];
  itemTypes: PmItemType[];
  loggedHours: Record<string, number>;
  assigneeNames: Record<string, string>;
}) {
  const typeOf = new Map(itemTypes.map((t) => [t.id, t]));
  const folderName = new Map(folders.map((f) => [f.id, f.name]));

  const groups = new Map<string, PmTask[]>();
  for (const t of tasks) {
    const key = t.folder_id ?? "__none__";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const orderedKeys = [
    ...folders.filter((f) => groups.has(f.id)).map((f) => f.id),
    ...(groups.has("__none__") ? ["__none__"] : []),
  ];

  if (tasks.length === 0) {
    return <p className="text-sm text-ink-3">Keine Aufgaben.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-rule bg-paper">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-[11px] uppercase tracking-wide text-ink-4">
            <th className="px-3 py-2 font-medium">Aufgabe</th>
            <th className="px-3 py-2 font-medium">Typ</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Priorität</th>
            <th className="px-3 py-2 font-medium">Zugewiesen</th>
            <th className="px-3 py-2 font-medium">Start</th>
            <th className="px-3 py-2 font-medium">Fällig</th>
            <th className="px-3 py-2 font-medium">Aufwand</th>
          </tr>
        </thead>
        <tbody>
          {orderedKeys.map((key) => (
            <FolderGroup
              key={key}
              label={key === "__none__" ? "Ohne Ordner" : (folderName.get(key) ?? "—")}
              tasks={groups.get(key) ?? []}
              slug={slug}
              typeOf={typeOf}
              loggedHours={loggedHours}
              assigneeNames={assigneeNames}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FolderGroup({
  label,
  tasks,
  slug,
  typeOf,
  loggedHours,
  assigneeNames,
}: {
  label: string;
  tasks: PmTask[];
  slug: string;
  typeOf: Map<string, PmItemType>;
  loggedHours: Record<string, number>;
  assigneeNames: Record<string, string>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <tr className="border-b border-rule-soft bg-paper-2">
        <td colSpan={8} className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">
          {label} <span className="text-ink-4">({tasks.length})</span>
        </td>
      </tr>
      {tasks.map((t) => {
        const type = t.item_type_id ? typeOf.get(t.item_type_id) : undefined;
        const overdue =
          t.due_date && t.due_date < today && t.status !== "done";
        return (
          <tr key={t.id} className="border-b border-rule-soft last:border-0">
            <td className="px-3 py-2">
              <Link
                href={`/teams/${slug}/tasks/${t.id}`}
                className="hover:text-action"
              >
                {t.title}
              </Link>
            </td>
            <td className="px-3 py-2 text-ink-3">
              {type ? `${type.icon} ${type.name}` : "Aufgabe"}
            </td>
            <td className="px-3 py-2">
              <StatusSelect taskId={t.id} slug={slug} current={t.status} />
            </td>
            <td className="px-3 py-2 text-ink-3">{PRIORITY_LABEL[t.priority]}</td>
            <td className="px-3 py-2 text-ink-3">
              {t.assignee_id ? (assigneeNames[t.assignee_id] ?? "—") : "—"}
            </td>
            <td className="px-3 py-2 text-ink-3">{t.start_date ?? "—"}</td>
            <td className={`px-3 py-2 ${overdue ? "font-medium text-bad" : "text-ink-3"}`}>
              {t.due_date ?? "—"}
              {overdue ? " !" : ""}
            </td>
            <td className="px-3 py-2 text-ink-3">
              {loggedHours[t.id] ? `${loggedHours[t.id]}h / ` : ""}
              {t.effort_estimate_hours ? `${t.effort_estimate_hours}h` : "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// Re-exported so the page can label the table's status column consistently.
export { TASK_STATUS_LABEL };
