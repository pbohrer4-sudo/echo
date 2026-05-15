"use client";

// Mini-Kalender für /inbox: zwei Monate nebeneinander (aktueller +
// nächster). Tage mit anstehenden Reminders/Todos bekommen einen Dot;
// überfällige (heute oder früher) bekommen einen stärkeren Marker.
// Klick auf einen Tag scrollt zum entsprechenden Datums-Heading in der
// Anstehend-Liste (smooth-scroll via hash).

import { useMemo } from "react";

interface DayMarker {
  // YYYY-MM-DD (lokal)
  key: string;
  count: number;
  // Mindestens ein Item ist heute oder überfällig → andere Farbe
  due: boolean;
}

interface Props {
  // Tage mit Reminders/Todos, YYYY-MM-DD → count + due-Flag
  markers: DayMarker[];
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dayKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

interface MonthSpec {
  year: number;
  month: number; // 0-indexed
  label: string;
}

function buildMonth(year: number, month: number): MonthSpec {
  const ref = new Date(year, month, 1);
  return {
    year,
    month,
    label: ref.toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric",
    }),
  };
}

function monthCells(spec: MonthSpec): { day: number | null; key: string | null }[] {
  const first = new Date(spec.year, spec.month, 1);
  // JS: Sonntag=0; wir wollen Mo=0
  const firstDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(spec.year, spec.month + 1, 0).getDate();
  const cells: { day: number | null; key: string | null }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, key: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, key: dayKey(spec.year, spec.month, d) });
  }
  // Auf 6×7=42 auffüllen für stabile Höhe
  while (cells.length < 42) cells.push({ day: null, key: null });
  return cells;
}

export function AgendaCalendar({ markers }: Props) {
  const markerMap = useMemo(() => {
    const m = new Map<string, DayMarker>();
    for (const x of markers) m.set(x.key, x);
    return m;
  }, [markers]);

  const today = new Date();
  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());
  const months: MonthSpec[] = [
    buildMonth(today.getFullYear(), today.getMonth()),
    buildMonth(
      today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear(),
      (today.getMonth() + 1) % 12,
    ),
  ];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {months.map((m) => {
        const cells = monthCells(m);
        return (
          <div key={`${m.year}-${m.month}`} className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-ink-3">
              {m.label}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <span
                  key={w}
                  className="text-center text-[10px] text-ink-4"
                  aria-hidden
                >
                  {w}
                </span>
              ))}
              {cells.map((c, i) => {
                if (!c.day) {
                  return <span key={`gap-${i}`} aria-hidden />;
                }
                const marker = c.key ? markerMap.get(c.key) : undefined;
                const isToday = c.key === todayKey;
                const base =
                  "relative flex h-9 items-center justify-center rounded text-xs transition";
                let tone = "text-ink-3 hover:bg-paper-2";
                if (isToday) {
                  tone =
                    "border border-action bg-action-soft text-action font-medium";
                } else if (marker?.due) {
                  tone = "bg-bad/10 text-bad hover:bg-bad/20";
                } else if (marker) {
                  tone = "text-ink-1 hover:bg-paper-2";
                }
                const inner = (
                  <>
                    <span>{c.day}</span>
                    {marker && (
                      <span
                        className={`absolute bottom-1 h-1 w-1 rounded-full ${
                          marker.due ? "bg-bad" : "bg-action"
                        }`}
                        aria-hidden
                      />
                    )}
                    {marker && marker.count > 1 && (
                      <span className="absolute bottom-0 right-1 text-[9px] text-ink-4">
                        {marker.count}
                      </span>
                    )}
                  </>
                );
                if (marker && c.key) {
                  return (
                    <a
                      key={c.key}
                      href={`#day-${c.key}`}
                      className={`${base} ${tone}`}
                      title={`${marker.count} Termin${marker.count === 1 ? "" : "e"}`}
                    >
                      {inner}
                    </a>
                  );
                }
                return (
                  <span key={c.key ?? `gap-${i}`} className={`${base} ${tone}`}>
                    {inner}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type { DayMarker };
