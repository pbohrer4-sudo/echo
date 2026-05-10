import { getOverviewStats } from "@/lib/admin-stats";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "nie eingeloggt";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 3600 * 1000));
  if (days === 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Wochen`;
  if (days < 365) return `vor ${Math.floor(days / 30)} Monaten`;
  return `vor ${Math.floor(days / 365)} Jahren`;
}

export default async function AdminOverviewPage() {
  const stats = await getOverviewStats();

  return (
    <div className="space-y-8">
      <div>
        <p className="t-label">Personal CRM</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-1">
          Admin Übersicht
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          Aggregierte Zahlen über alle registrierten Nutzer. Service-Role-
          Query — bypassed RLS, deshalb hier sichtbar.
        </p>
      </div>

      {/* Hauptkennzahlen */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Registrierte Nutzer" value={stats.total_users} />
        <Metric
          label="Aktiv (7 Tage)"
          value={stats.active_7d}
          hint={pct(stats.active_7d, stats.total_users)}
        />
        <Metric
          label="Aktiv (30 Tage)"
          value={stats.active_30d}
          hint={pct(stats.active_30d, stats.total_users)}
        />
        <Metric
          label="Onboarded"
          value={stats.onboarded}
          hint={pct(stats.onboarded, stats.total_users)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Personen gesamt" value={stats.people_total} />
        <Metric
          label="Interaktionen gesamt"
          value={stats.interactions_total}
        />
        <Metric label="Debriefs gesamt" value={stats.debriefs_total} />
      </div>

      {/* Subscription-Placeholder — bis Stripe angebunden ist */}
      <section className="rounded border border-dashed border-rule bg-paper-2 p-5">
        <p className="t-label">Zahlende Nutzer</p>
        <p className="mt-2 text-sm text-ink-3">
          Subscription-Daten sind noch nicht im Schema. Stripe ist als
          Dependency installiert, aber es fehlt die Verbindung zwischen
          Stripe-Customer und{" "}
          <code className="rounded bg-paper px-1 font-mono text-xs">
            profiles
          </code>
          . Sag Bescheid wenn die Subscription-Tabelle gebaut werden soll
          — dann erweitert sich diese Karte um MRR / Active-Subscriptions
          / Tier-Verteilung.
        </p>
      </section>

      {/* Signups pro Woche — Mini-Histogramm */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="t-label">Signups · letzte 8 Wochen</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
            wöchentlich
          </p>
        </div>
        <WeeklyBars data={stats.signups_weekly} />
      </section>

      {/* Letzte Signups */}
      <section>
        <p className="t-label mb-2">Neueste Anmeldungen</p>
        <div className="overflow-hidden rounded border border-rule bg-paper">
          <div className="grid grid-cols-[1.5fr_1fr_1fr_80px] gap-4 border-b border-rule bg-paper-2 px-4 py-2.5 text-xs">
            <span className="t-label">Email</span>
            <span className="t-label">Registriert</span>
            <span className="t-label">Zuletzt aktiv</span>
            <span className="t-label text-right">Onboarded</span>
          </div>
          {stats.recent_signups.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-3">
              Noch keine Anmeldungen.
            </p>
          ) : (
            stats.recent_signups.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[1.5fr_1fr_1fr_80px] gap-4 border-b border-rule-soft px-4 py-2.5 text-sm last:border-b-0"
              >
                <span className="truncate text-ink-1">{s.email}</span>
                <span className="font-mono text-xs text-ink-3">
                  {formatDate(s.created_at)}
                </span>
                <span className="font-mono text-xs text-ink-3">
                  {formatRelative(s.last_sign_in_at)}
                </span>
                <span className="text-right">
                  {s.onboarded ? (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-good">
                      ✓ ja
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
                      —
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded border border-rule bg-paper p-4">
      <p className="t-label">{label}</p>
      <p className="mt-2 font-mono text-3xl tabular-nums text-ink-1">
        {value.toLocaleString("de-DE")}
      </p>
      {hint && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
          {hint}
        </p>
      )}
    </div>
  );
}

function pct(part: number, whole: number): string {
  if (whole === 0) return "0 %";
  return `${Math.round((part / whole) * 100)} %`;
}

function WeeklyBars({
  data,
}: {
  data: { week: string; count: number }[];
}) {
  if (data.length === 0) {
    return (
      <p className="rounded border border-rule bg-paper p-4 text-sm text-ink-3">
        Noch keine Daten in den letzten 8 Wochen.
      </p>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-32 items-end gap-2 rounded border border-rule bg-paper p-4">
      {data.map((d) => {
        const pct = Math.round((d.count / max) * 100);
        const label = new Date(d.week).toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "short",
        });
        return (
          <div
            key={d.week}
            className="flex flex-1 flex-col items-center gap-1.5"
          >
            <span className="font-mono text-[10px] tabular-nums text-ink-3">
              {d.count}
            </span>
            <div
              className="w-full rounded-t bg-action/60 transition-all"
              style={{ height: `${Math.max(2, pct)}%` }}
              aria-label={`${d.count} Signups in der Woche ${label}`}
            />
            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-4">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
