import Link from "next/link";
import { notFound } from "next/navigation";
import { findProvider } from "@/lib/connections-catalog";
import { getConnectionByProvider } from "@/lib/connections";
import { disconnect, startConnect } from "../actions";
import { SyncTriggerCard } from "@/components/sync-trigger-card";
import { WhatsappConfigCard } from "@/components/whatsapp-config-card";

const STATUS_LABEL: Record<string, string> = {
  connected: "Verbunden",
  pending: "Pending",
  error: "Fehler",
  expired: "Abgelaufen",
  disconnected: "Getrennt",
};

const STATUS_TONE: Record<string, string> = {
  connected: "border-action/40 bg-action-soft text-action",
  pending: "border-rule bg-paper-2 text-ink-3",
  error: "border-bad/30 bg-bad/5 text-bad",
  expired: "border-bad/30 bg-bad/5 text-bad",
  disconnected: "border-rule bg-paper-2 text-ink-4",
};

const CATEGORY_LABEL: Record<string, string> = {
  crm: "CRM",
  comm: "Kommunikation",
  productivity: "Produktivität",
  social: "Social",
  webhook: "Webhook",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ConnectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { provider } = await params;
  const { connected, error } = await searchParams;
  const def = findProvider(provider);
  if (!def) notFound();

  const conn = await getConnectionByProvider(provider);
  const status = conn?.status ?? "disconnected";
  const isLive = status === "connected";

  const startAction = startConnect.bind(null, provider);
  const disconnectAction = disconnect.bind(null, provider);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl space-y-10">
        <Link
          href="/connections"
          className="t-label inline-flex items-center hover:text-ink-1"
        >
          ← Verbindungen
        </Link>

        {connected && (
          <p className="rounded border border-action/30 bg-action-soft px-4 py-2 text-sm text-ink-1">
            ✓ Stub-Verbindung angelegt — V1 erzeugt einen synthetischen
            Token, V2 wired echte OAuth.
          </p>
        )}
        {error && (
          <p className="rounded border border-bad/30 bg-bad/5 px-4 py-2 text-sm text-bad">
            {decodeURIComponent(error)}
          </p>
        )}

        <header className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-rule bg-paper-2 font-mono text-base font-semibold uppercase tracking-tight text-ink-1"
              aria-hidden
            >
              {def.glyph}
            </span>
            <div className="space-y-2">
              <p className="t-label">{CATEGORY_LABEL[def.category]}</p>
              <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
                {def.name}
              </h1>
              <p className="text-sm text-ink-3">{def.vendor}</p>
              <span
                className={`inline-block rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_TONE[status]}`}
              >
                {STATUS_LABEL[status]}
                {def.status === "stub" && " · V1-Stub"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isLive ? (
              <form action={disconnectAction}>
                <button
                  type="submit"
                  className="rounded border border-rule px-3 py-1.5 text-xs text-ink-3 transition hover:border-bad hover:text-bad"
                >
                  Trennen
                </button>
              </form>
            ) : (
              <form action={startAction}>
                <button
                  type="submit"
                  className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
                >
                  Verbinden
                </button>
              </form>
            )}
          </div>
        </header>

        <section>
          <div className="section-head">
            <span className="t-label">Beschreibung</span>
            <span className="rule" />
          </div>
          <p className="text-sm leading-relaxed text-ink-2">
            {def.description}
          </p>
        </section>

        {isLive && provider === "google_calendar" && (
          <SyncTriggerCard
            endpoint="/api/calendar/sync"
            label="Kalender"
            description="Holt Events aus den letzten 7 Tagen + nächsten 30 Tagen, matcht Teilnehmer auf bekannte Personen und legt vergangene Termine als Interaktionen an."
          />
        )}
        {isLive && provider === "gmail" && (
          <SyncTriggerCard
            endpoint="/api/email/sync"
            label="Gmail"
            description="Pulled die letzten 30 Mails (ohne Promotions/Social), matcht Sender + Empfänger auf bekannte Personen und legt jede gematchte Mail als Email-Interaktion an."
          />
        )}
        {provider === "whatsapp" && <WhatsappConfigCard />}

        <div className="grid gap-8 md:grid-cols-2">
          <section>
            <div className="section-head">
              <span className="t-label">Kann lesen</span>
              <span className="rule" />
            </div>
            {(def.capabilities.read ?? []).length === 0 ? (
              <p className="text-xs italic text-ink-4">—</p>
            ) : (
              <ul className="space-y-1">
                {def.capabilities.read!.map((c) => (
                  <li
                    key={c}
                    className="flex items-baseline gap-2 text-sm text-ink-2"
                  >
                    <span className="t-label" style={{ minWidth: 16 }}>
                      ←
                    </span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <div className="section-head">
              <span className="t-label">Kann schreiben</span>
              <span className="rule" />
            </div>
            {(def.capabilities.write ?? []).length === 0 ? (
              <p className="text-xs italic text-ink-4">—</p>
            ) : (
              <ul className="space-y-1">
                {def.capabilities.write!.map((c) => (
                  <li
                    key={c}
                    className="flex items-baseline gap-2 text-sm text-ink-2"
                  >
                    <span className="t-label" style={{ minWidth: 16 }}>
                      →
                    </span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {def.default_scopes.length > 0 && (
          <section>
            <div className="section-head">
              <span className="t-label">OAuth-Scopes</span>
              <span className="rule" />
            </div>
            <ul className="space-y-1">
              {def.default_scopes.map((s) => (
                <li
                  key={s}
                  className="font-mono text-[11px] text-ink-2 break-all"
                >
                  {s}
                </li>
              ))}
            </ul>
          </section>
        )}

        {def.mcp_server && (
          <section>
            <div className="section-head">
              <span className="t-label">MCP-Server (V3-Runtime)</span>
              <span className="rule" />
            </div>
            <dl className="kv">
              <dt>Transport</dt>
              <dd className="mono">{def.mcp_server.transport}</dd>
              {def.mcp_server.package && (
                <>
                  <dt>Package</dt>
                  <dd className="mono">{def.mcp_server.package}</dd>
                </>
              )}
              {def.mcp_server.endpoint && (
                <>
                  <dt>Endpoint</dt>
                  <dd className="mono">{def.mcp_server.endpoint}</dd>
                </>
              )}
            </dl>
          </section>
        )}

        {conn && (
          <section>
            <div className="section-head">
              <span className="t-label">Connection-Status</span>
              <span className="rule" />
            </div>
            <dl className="kv">
              <dt>Account</dt>
              <dd>{conn.account_label ?? "—"}</dd>
              <dt>Verbunden</dt>
              <dd className="mono">{fmtDate(conn.connected_at)}</dd>
              <dt>Token läuft ab</dt>
              <dd className="mono">{fmtDate(conn.token_expires_at)}</dd>
              <dt>Zuletzt benutzt</dt>
              <dd className="mono">{fmtDate(conn.last_used_at)}</dd>
              {conn.last_error && (
                <>
                  <dt>Letzter Fehler</dt>
                  <dd className="text-bad">{conn.last_error}</dd>
                </>
              )}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
