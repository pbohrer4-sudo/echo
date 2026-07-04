import Link from "next/link";
import type { PmTask } from "@/lib/pm/types";

// Read-only Gantt timeline. Each task with a date becomes a bar positioned
// on a day grid spanning from the earliest start to the latest due date
// (capped at 90 days). Tasks without any date are listed below the chart so
// nothing silently disappears.
export function GanttView({ slug, tasks }: { slug: string; tasks: PmTask[] }) {
  const dated = tasks.filter((t) => t.start_date || t.due_date);
  const undated = tasks.filter((t) => !t.start_date && !t.due_date);

  if (dated.length === 0) {
    return (
      <p className="text-sm text-ink-3">
        Keine Aufgaben mit Start- oder Fälligkeitsdatum. Setze Termine auf der
        Aufgaben-Detailseite, dann erscheinen sie hier als Zeitbalken.
      </p>
    );
  }

  const MS = 86400_000;
  const dayOf = (d: string) => Math.floor(new Date(d).getTime() / MS);
  const today = dayOf(new Date().toISOString().slice(0, 10));

  let min = Infinity;
  let max = -Infinity;
  for (const t of dated) {
    const s = dayOf(t.start_date ?? t.due_date!);
    const e = dayOf(t.due_date ?? t.start_date!);
    if (s < min) min = s;
    if (e > max) max = e;
  }
  min = Math.min(min, today);
  max = Math.max(max, today, min + 6);
  const span = Math.min(max - min + 1, 90);

  const fmt = (dayIdx: number) => {
    const d = new Date((min + dayIdx) * MS);
    return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.`;
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-rule bg-paper p-4">
        <div style={{ minWidth: `${240 + span * 24}px` }}>
          {/* Day header */}
          <div
            className="grid text-[9px] text-ink-4"
            style={{ gridTemplateColumns: `240px repeat(${span}, 24px)` }}
          >
            <div />
            {Array.from({ length: span }, (_, i) => (
              <div
                key={i}
                className={`border-l border-rule-soft px-0.5 pb-1 ${min + i === today ? "font-semibold text-action" : ""}`}
              >
                {i % 2 === 0 ? fmt(i) : ""}
              </div>
            ))}
          </div>
          {/* Bars */}
          {dated.map((t) => {
            const s = Math.max(dayOf(t.start_date ?? t.due_date!) - min, 0);
            const e = Math.min(dayOf(t.due_date ?? t.start_date!) - min, span - 1);
            const done = t.status === "done";
            const overdue = !done && t.due_date && dayOf(t.due_date) < today;
            return (
              <div
                key={t.id}
                className="grid items-center border-t border-rule-soft"
                style={{ gridTemplateColumns: `240px repeat(${span}, 24px)` }}
              >
                <Link
                  href={`/teams/${slug}/tasks/${t.id}`}
                  className="truncate py-1.5 pr-3 text-xs hover:text-action"
                  title={t.title}
                >
                  {t.title}
                </Link>
                <div
                  className="h-4 rounded"
                  style={{
                    gridColumn: `${s + 2} / ${e + 3}`,
                    background: done
                      ? "var(--good)"
                      : overdue
                        ? "var(--bad)"
                        : "var(--action)",
                    opacity: done ? 0.5 : 0.85,
                  }}
                  title={`${t.start_date ?? "?"} → ${t.due_date ?? "?"}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <p className="text-xs text-ink-4">
          Ohne Termin ({undated.length}):{" "}
          {undated.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <Link
                href={`/teams/${slug}/tasks/${t.id}`}
                className="underline hover:text-action"
              >
                {t.title}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
