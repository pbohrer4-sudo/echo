import Link from "next/link";
import { listConnections } from "@/lib/connections";
import { PROVIDERS } from "@/lib/connections-catalog";
import { APP_CONFIG } from "@/lib/config";

const STATUS_TONE: Record<string, string> = {
  connected: "border-action/40 bg-action-soft text-action",
  pending: "border-rule bg-paper-2 text-ink-3",
  error: "border-bad/30 bg-bad/5 text-bad",
  expired: "border-bad/30 bg-bad/5 text-bad",
  disconnected: "border-rule bg-paper-2 text-ink-4",
};

const STATUS_LABEL: Record<string, string> = {
  connected: "Verbunden",
  pending: "Pending",
  error: "Fehler",
  expired: "Abgelaufen",
  disconnected: "Getrennt",
};

const CATEGORY_LABEL: Record<string, string> = {
  crm: "CRM",
  comm: "Kommunikation",
  productivity: "Produktivität",
  social: "Social",
  webhook: "Webhook",
};

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const connections = await listConnections();
  const byProvider = new Map(connections.map((c) => [c.provider, c]));

  const groups = new Map<string, typeof PROVIDERS>();
  for (const p of PROVIDERS) {
    if (!groups.has(p.category)) groups.set(p.category, []);
    groups.get(p.category)!.push(p);
  }

  const connectedCount = connections.filter(
    (c) => c.status === "connected",
  ).length;

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Connections · MCP-Layer</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Verbindungen
          </h1>
          <p className="max-w-2xl text-sm text-ink-3">
            Externe Systeme die {APP_CONFIG.PUBLIC_NAME} ansprechen kann. V1: OAuth-Flow ist
            ein Stub — beim Connect wird ein synthetischer Token gespeichert
            damit du die UI testen kannst. V2 wired echte OAuth-Flows pro
            Provider, V3 spawnt MCP-Server und führt Workflow-Actions aus.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="rounded border border-action/40 bg-action-soft px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-action">
              {connectedCount} verbunden
            </span>
            <span className="rounded border border-rule-soft bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              {PROVIDERS.length} verfügbar
            </span>
          </div>
        </header>

        {error && (
          <p className="rounded border border-bad/30 bg-bad/5 px-4 py-2 text-sm text-bad">
            {decodeURIComponent(error)}
          </p>
        )}

        {Array.from(groups.entries()).map(([category, providers]) => (
          <section key={category}>
            <div className="section-head">
              <span className="t-label">{CATEGORY_LABEL[category] ?? category}</span>
              <span className="rule" />
            </div>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {providers.map((p) => {
                const conn = byProvider.get(p.id);
                const status = conn?.status ?? "disconnected";
                return (
                  <li key={p.id}>
                    <Link
                      href={`/connections/${p.id}`}
                      className={`flex items-start gap-3 rounded border bg-paper p-4 transition hover:border-action hover:bg-paper-2 ${
                        status === "connected"
                          ? "border-action/40"
                          : "border-rule"
                      }`}
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-rule bg-paper-2 font-mono text-[12px] font-semibold uppercase tracking-tight text-ink-2"
                        aria-hidden
                      >
                        {p.glyph}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-medium text-ink-1">
                            {p.name}
                          </p>
                          <span
                            className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${STATUS_TONE[status]}`}
                          >
                            {STATUS_LABEL[status]}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-ink-4">
                          {p.vendor}
                        </p>
                        <p className="mt-1.5 line-clamp-2 text-xs text-ink-3">
                          {p.description}
                        </p>
                        {conn?.account_label && (
                          <p className="mt-1.5 truncate font-mono text-[10px] uppercase tracking-wider text-ink-4">
                            {conn.account_label}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
