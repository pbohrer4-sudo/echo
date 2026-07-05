import Link from "next/link";
import { getOrCreateWorkspace, listWorkspaceMembers } from "@/lib/pm/workspace";
import { getDepartmentMap } from "@/lib/pm/departments";
import { listStream } from "@/lib/pm/tasks";
import { TASK_STATUS_LABEL } from "@/lib/pm/types";

export const dynamic = "force-dynamic";

// Wrike "Stream": the workspace's latest activity (comments + system
// updates), each entry linking to its task. ?filter=mine hides auto updates
// from other people's work.
export default async function StreamPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const ws = await getOrCreateWorkspace();
  const [entries, deptMap, members] = await Promise.all([
    listStream(ws.id, 40),
    getDepartmentMap(ws.id),
    listWorkspaceMembers(ws.id),
  ]);
  const nameOf = (id: string | null) => {
    if (!id) return "Hub-Bot";
    const m = members.find((x) => x.user_id === id);
    return m?.display_name || id.slice(0, 8);
  };

  const shown =
    filter === "comments" ? entries.filter((e) => !e.comment.is_system) : entries;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stream</h1>
          <p className="mt-1 text-sm text-ink-3">
            Die letzte Aktivität im ganzen Workspace.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link
            href="/teams/stream"
            className={`rounded-lg px-3 py-1.5 ${!filter ? "bg-action font-medium text-paper" : "border border-rule text-ink-3 hover:border-action"}`}
          >
            Alles
          </Link>
          <Link
            href="/teams/stream?filter=comments"
            className={`rounded-lg px-3 py-1.5 ${filter === "comments" ? "bg-action font-medium text-paper" : "border border-rule text-ink-3 hover:border-action"}`}
          >
            Ohne Auto-Updates
          </Link>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rule bg-paper-2 p-6 text-center text-sm text-ink-3">
          Noch keine Aktivität.
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map(({ comment, task }) => {
            const dept = deptMap[task.owner_department_id];
            return (
              <div
                key={comment.id}
                className={`rounded-xl border p-4 ${comment.is_system ? "border-rule-soft bg-paper-2" : "border-rule bg-paper"}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={dept ? `/teams/${dept.slug}/tasks/${task.id}` : "/teams"}
                    className="min-w-0 truncate text-sm font-medium hover:text-action"
                  >
                    {task.title}
                  </Link>
                  <span className="shrink-0 text-[11px] text-ink-4">
                    {dept?.name ?? "—"} · {TASK_STATUS_LABEL[task.status]}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-2">
                  {comment.body}
                </p>
                <p className="mt-1.5 text-[11px] text-ink-4">
                  {comment.is_system ? "Hub-Bot" : nameOf(comment.user_id)} ·{" "}
                  {new Date(comment.created_at).toLocaleString("de-DE")}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
