import {
  buildAchievements,
  getGamificationStats,
  levelFromXp,
  totalXp,
  type Achievement,
} from "@/lib/gamification";

export async function GamificationDashboard() {
  const stats = await getGamificationStats();
  const achievements = buildAchievements(stats);
  const xp = totalXp(achievements);
  const level = levelFromXp(xp);

  const done = achievements.filter((a) => a.done);
  const open = achievements.filter((a) => !a.done);

  return (
    <div className="space-y-10">
      <div className="rounded border border-action/30 bg-action-soft p-6">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat
            label="Aktueller Streak"
            value={
              stats.current_streak > 0
                ? `${stats.current_streak} 🔥`
                : "0"
            }
            subtitle={stats.done_today ? "Heute erledigt" : "Heute noch offen"}
          />
          <Stat
            label="Bestmarke"
            value={`${stats.longest_streak} Tage`}
          />
          <Stat
            label="Level"
            value={String(level.level)}
            subtitle={`${level.current}/${level.next} XP`}
          />
          <Stat
            label="Gesamt-XP"
            value={String(xp)}
            subtitle={`${done.length}/${achievements.length} Erfolge`}
          />
        </div>
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded bg-paper-3">
            <div
              className="h-full bg-action transition-all"
              style={{ width: `${(level.current / level.next) * 100}%` }}
            />
          </div>
          <p className="mt-1 t-label">
            Noch {level.toNext} XP bis Level {level.level + 1}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
        <SimpleStat label="Debriefs gesamt" value={stats.total_debriefs} />
        <SimpleStat label="Personen" value={stats.total_people} />
        <SimpleStat
          label="Interaktionen"
          value={stats.total_interactions}
        />
        <SimpleStat
          label="Versprechen eingehalten"
          value={stats.total_promises_kept}
        />
        <SimpleStat
          label="Aufgaben erledigt"
          value={stats.total_todos_completed}
        />
        <SimpleStat
          label="Im Rhythmus"
          value={
            stats.on_rhythm_pct === null
              ? "—"
              : `${stats.on_rhythm_pct}%`
          }
        />
      </div>

      {done.length > 0 && (
        <section>
          <div className="section-head">
            <span className="t-label">Erreicht · {done.length}</span>
            <span className="rule" />
          </div>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {done.map((a) => (
              <AchievementRow key={a.id} achievement={a} />
            ))}
          </ul>
        </section>
      )}

      {open.length > 0 && (
        <section>
          <div className="section-head">
            <span className="t-label">In Arbeit · {open.length}</span>
            <span className="rule" />
          </div>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {open.map((a) => (
              <AchievementRow key={a.id} achievement={a} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div>
      <p className="t-label">{label}</p>
      <p className="mt-1 font-serif text-3xl tracking-tight text-ink-1">
        {value}
      </p>
      {subtitle && <p className="t-label mt-0.5">{subtitle}</p>}
    </div>
  );
}

function SimpleStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded border border-rule bg-paper p-4">
      <p className="t-label">{label}</p>
      <p className="mt-1 font-serif text-2xl tracking-tight text-ink-1">
        {value}
      </p>
    </div>
  );
}

function AchievementRow({ achievement }: { achievement: Achievement }) {
  const a = achievement;
  return (
    <li
      className={`flex items-start gap-3 rounded border px-3 py-2.5 ${
        a.done
          ? "border-action/30 bg-action-soft"
          : "border-rule bg-paper"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          a.done
            ? "bg-action text-paper"
            : "border border-rule bg-paper-2 text-ink-4"
        }`}
        aria-hidden
      >
        {a.done ? "✓" : ""}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className={`text-sm font-medium ${a.done ? "text-ink-1" : "text-ink-2"}`}
          >
            {a.title}
          </p>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            {a.xp} XP
          </span>
        </div>
        <p className="text-xs text-ink-3">{a.description}</p>
        {!a.done && a.progress > 0 && (
          <div className="mt-2 h-1 w-full rounded bg-paper-3">
            <div
              className="h-full rounded bg-action/50"
              style={{ width: `${a.progress * 100}%` }}
            />
          </div>
        )}
      </div>
    </li>
  );
}
