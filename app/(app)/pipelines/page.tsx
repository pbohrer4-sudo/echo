import Link from "next/link";
import { listPipelines } from "@/lib/pipelines";

function fmtCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString("de-DE")} ${currency}`;
  }
}

export default async function PipelinesListPage() {
  const pipelines = await listPipelines();

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <p className="t-label">Vertrieb · konfigurierbar</p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
              Pipelines
            </h1>
            <p className="max-w-xl text-sm text-ink-3">
              Konfigurierbare Stufen, individuelle Felder, Deals an Personen
              oder Organisationen geknüpft.
            </p>
          </div>
          <Link
            href="/pipelines/new"
            className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
          >
            + Pipeline
          </Link>
        </header>

        {pipelines.length === 0 ? (
          <div className="rounded border border-rule bg-paper-2 px-6 py-16 text-center">
            <p className="t-label mb-2">Noch keine Pipelines</p>
            <p className="mx-auto max-w-md text-sm text-ink-3">
              Klick „+ Pipeline" — neue Pipelines starten mit den 6
              Sales-Standardstufen (Lead → Qualified → Proposal → Negotiation
              → Won / Lost). Stufen + Felder beliebig anpassen.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {pipelines.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/pipelines/${p.id}`}
                  className="block rounded border border-rule bg-paper p-5 transition hover:border-action hover:bg-paper-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold tracking-tight text-ink-1">
                        {p.name}
                      </h2>
                      {p.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-ink-3">
                          {p.description}
                        </p>
                      )}
                    </div>
                    <span className="t-label">{p.stages.length} Stufen</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <Stat label="Deals" value={String(p.deal_count)} />
                    <Stat
                      label="Pipeline-Wert"
                      value={fmtCurrency(p.open_value, p.default_currency)}
                    />
                    <Stat
                      label="Won"
                      value={fmtCurrency(p.won_value, p.default_currency)}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="t-label">{label}</p>
      <p className="mt-1 font-serif text-lg tracking-tight text-ink-1">
        {value}
      </p>
    </div>
  );
}
