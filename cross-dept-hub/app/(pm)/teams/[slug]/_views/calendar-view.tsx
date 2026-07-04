import Link from "next/link";
import type { PmTask } from "@/lib/pm/types";

// Month calendar keyed on due dates. ?month=YYYY-MM navigates; defaults to
// the current month.
export function CalendarView({
  slug,
  tasks,
  month,
  tab,
}: {
  slug: string;
  tasks: PmTask[];
  month?: string;
  tab: string;
}) {
  const now = new Date();
  const [year, mon] = /^\d{4}-\d{2}$/.test(month ?? "")
    ? month!.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];

  const first = new Date(Date.UTC(year, mon - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  // Monday-first offset (getUTCDay: 0 = Sunday).
  const offset = (first.getUTCDay() + 6) % 7;

  const byDay = new Map<string, PmTask[]>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    byDay.set(t.due_date, [...(byDay.get(t.due_date) ?? []), t]);
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const prev = mon === 1 ? `${year - 1}-12` : `${year}-${pad(mon - 1)}`;
  const next = mon === 12 ? `${year + 1}-01` : `${year}-${pad(mon + 1)}`;
  const todayStr = now.toISOString().slice(0, 10);
  const monthLabel = first.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{monthLabel}</h3>
        <div className="flex gap-2 text-sm">
          <Link
            href={`/teams/${slug}?tab=${tab}&view=calendar&month=${prev}`}
            className="rounded border border-rule px-2 py-1 hover:border-action"
          >
            ← Zurück
          </Link>
          <Link
            href={`/teams/${slug}?tab=${tab}&view=calendar&month=${next}`}
            className="rounded border border-rule px-2 py-1 hover:border-action"
          >
            Weiter →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-rule bg-rule">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
          <div key={d} className="bg-paper-2 px-2 py-1 text-[10px] font-medium uppercase text-ink-4">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const dateStr = day ? `${year}-${pad(mon)}-${pad(day)}` : null;
          const dayTasks = dateStr ? (byDay.get(dateStr) ?? []) : [];
          return (
            <div
              key={i}
              className={`min-h-20 bg-paper p-1.5 ${dateStr === todayStr ? "ring-2 ring-inset ring-action/40" : ""}`}
            >
              {day && (
                <p className="mb-1 text-[10px] text-ink-4">{day}</p>
              )}
              {dayTasks.slice(0, 3).map((t) => (
                <Link
                  key={t.id}
                  href={`/teams/${slug}/tasks/${t.id}`}
                  className="mb-0.5 block truncate rounded bg-action-soft px-1 py-0.5 text-[10px] text-ink-1 hover:bg-action hover:text-paper"
                  title={t.title}
                >
                  {t.title}
                </Link>
              ))}
              {dayTasks.length > 3 && (
                <p className="text-[9px] text-ink-4">+{dayTasks.length - 3} weitere</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
