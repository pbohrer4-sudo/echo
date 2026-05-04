"use client";

import { useState } from "react";

type Period = "month" | "year";

interface Stats {
  periodLabel: string;
  interactions: number;
  uniquePeople: number;
  newPeople: number;
  promisesKept: number;
  todosCompleted: number;
  debriefs: number;
  longestStreak: number;
  topTopics: { topic: string; count: number }[];
  topPeople: { name: string; count: number }[];
  sentiment: { positive: number; neutral: number; tense: number };
}

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function RecapRunner() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>("month");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [text, setText] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, year, month }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Recap ${res.status}`);
      }
      const data = (await res.json()) as { text: string; stats: Stats };
      setText(data.text);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  const years: number[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) years.push(y);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded border border-rule bg-paper p-4">
        <div className="flex h-9 rounded border border-rule bg-paper p-0.5 text-xs">
          {(["month", "year"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded px-3 transition-colors ${
                period === p
                  ? "bg-paper-2 text-ink-1"
                  : "text-ink-3 hover:text-ink-1"
              }`}
            >
              {p === "month" ? "Monat" : "Jahr"}
            </button>
          ))}
        </div>

        {period === "month" && (
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="h-9 rounded border border-rule bg-paper px-3 text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        )}

        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-9 rounded border border-rule bg-paper px-3 text-sm font-mono"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="ml-auto rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
        >
          {loading ? "Erzeuge…" : "Rückblick erzeugen"}
        </button>
      </div>

      {error && (
        <p className="rounded border border-bad/30 bg-bad/5 px-4 py-2 text-sm text-bad">
          Fehler: {error}
        </p>
      )}

      {stats && <RecapStatsGrid stats={stats} />}

      {text && (
        <article className="rounded border border-rule bg-paper p-6">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-ink-1">
            {text}
          </p>
        </article>
      )}
    </div>
  );
}

function RecapStatsGrid({ stats }: { stats: Stats }) {
  const cells: { label: string; value: string }[] = [
    { label: "Interaktionen", value: String(stats.interactions) },
    { label: "Personen kontaktiert", value: String(stats.uniquePeople) },
    { label: "Neue Personen", value: String(stats.newPeople) },
    { label: "Versprechen eingehalten", value: String(stats.promisesKept) },
    { label: "Aufgaben erledigt", value: String(stats.todosCompleted) },
    { label: "Debriefs", value: String(stats.debriefs) },
    { label: "Längster Streak", value: `${stats.longestStreak} Tage` },
  ];

  return (
    <div className="grid grid-cols-2 gap-px rounded border border-rule bg-rule sm:grid-cols-4 md:grid-cols-7">
      {cells.map((c) => (
        <div key={c.label} className="bg-paper p-3">
          <p className="t-label">{c.label}</p>
          <p className="mt-1 font-serif text-2xl tracking-tight text-ink-1">
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
