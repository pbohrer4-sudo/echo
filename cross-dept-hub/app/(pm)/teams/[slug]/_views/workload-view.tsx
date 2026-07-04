import type { MemberWorkload } from "@/lib/pm/workload";

// Color-coded workload chart: estimated open hours per person vs. the
// department's sprint capacity. Green under 70%, amber to 100%, red above.
export function WorkloadView({
  workload,
  capacityHours,
}: {
  workload: MemberWorkload[];
  capacityHours: number | null;
}) {
  const maxHours = Math.max(
    capacityHours ?? 0,
    ...workload.map((w) => w.estimated_hours),
    1,
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-4">
        Geschätzte offene Stunden pro Person
        {capacityHours
          ? ` - Kapazität pro Person: ${capacityHours}h (Abteilungs-Einstellung)`
          : " - keine Kapazität hinterlegt (in den Abteilungs-Einstellungen setzbar)"}
        . Erfasste Stunden aus der Zeiterfassung stehen daneben.
      </p>

      <div className="space-y-3 rounded-xl border border-rule bg-paper p-4">
        {workload.length === 0 && (
          <p className="text-sm text-ink-3">Keine offenen Aufgaben.</p>
        )}
        {workload.map((w) => {
          const ratio = capacityHours
            ? w.estimated_hours / capacityHours
            : null;
          const color =
            ratio == null
              ? "var(--action)"
              : ratio > 1
                ? "var(--bad)"
                : ratio > 0.7
                  ? "var(--warn)"
                  : "var(--good)";
          const width = Math.min((w.estimated_hours / maxHours) * 100, 100);
          return (
            <div key={w.user_id ?? "unassigned"}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className={w.user_id ? "" : "italic text-ink-3"}>
                  {w.display_name}
                </span>
                <span className="text-xs text-ink-4">
                  {w.open_tasks} Aufgaben · {w.estimated_hours}h geschätzt ·{" "}
                  {w.logged_hours}h erfasst
                  {ratio != null && ` · ${Math.round(ratio * 100)}% Auslastung`}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded bg-paper-3">
                <div
                  className="h-full rounded"
                  style={{ width: `${width}%`, background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
