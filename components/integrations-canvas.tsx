"use client";

import { useState } from "react";
import {
  INTEGRATIONS,
  integrationsByDirection,
  type Integration,
  type IntegrationStatus,
} from "@/lib/integrations";

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  connected: "Aktiv",
  available: "Verfügbar",
  planned: "Geplant",
};

const STATUS_TONE: Record<IntegrationStatus, string> = {
  connected: "border-action/40 bg-action-soft text-action",
  available: "border-rule bg-paper text-ink-2",
  planned: "border-rule-soft bg-paper text-ink-4",
};

const STATUS_DOT: Record<IntegrationStatus, string> = {
  connected: "var(--action)",
  available: "var(--ink-3)",
  planned: "var(--ink-4)",
};

const DIR_GLYPH: Record<"inbound" | "outbound" | "both", string> = {
  inbound: "→",
  outbound: "→",
  both: "↔",
};

export function IntegrationsCanvas() {
  const inbound = integrationsByDirection("inbound");
  const outbound = integrationsByDirection("outbound");
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = activeId
    ? INTEGRATIONS.find((i) => i.id === activeId) ?? null
    : null;

  return (
    <div className="space-y-10">
      <div className="grid items-center gap-6 md:grid-cols-[1fr_220px_1fr]">
        <Column
          title="Eingehend"
          subtitle="Daten fließen in ECHO"
          items={inbound}
          activeId={activeId}
          onSelect={setActiveId}
          align="right"
        />

        <EchoHub />

        <Column
          title="Ausgehend"
          subtitle="ECHO speist andere Systeme"
          items={outbound}
          activeId={activeId}
          onSelect={setActiveId}
          align="left"
        />
      </div>

      {active ? (
        <DetailPanel integration={active} onClose={() => setActiveId(null)} />
      ) : (
        <div className="rounded border border-rule bg-paper-2 px-6 py-10 text-center">
          <p className="t-label mb-2">Wähle eine Integration</p>
          <p className="text-sm text-ink-3">
            Klick auf eine Karte links oder rechts — du siehst dann Workflows
            und Feld-Mappings dieser Verbindung.
          </p>
        </div>
      )}
    </div>
  );
}

function EchoHub() {
  return (
    <div className="flex justify-center">
      <div className="relative flex h-44 w-44 flex-col items-center justify-center rounded-full border-2 border-action bg-action-soft text-center">
        <span className="font-serif text-2xl font-semibold tracking-tight text-ink-1">
          ECHO
        </span>
        <span className="t-label mt-1">Personal CRM</span>
        <span
          className="absolute -inset-3 -z-10 rounded-full border border-action/20"
          aria-hidden
        />
        <span
          className="absolute -inset-6 -z-20 rounded-full border border-action/10"
          aria-hidden
        />
      </div>
    </div>
  );
}

function Column({
  title,
  subtitle,
  items,
  activeId,
  onSelect,
  align,
}: {
  title: string;
  subtitle: string;
  items: Integration[];
  activeId: string | null;
  onSelect: (id: string) => void;
  align: "left" | "right";
}) {
  return (
    <div className="space-y-3">
      <div className={`px-1 ${align === "right" ? "text-right" : "text-left"}`}>
        <p className="t-label">{title}</p>
        <p className="text-xs text-ink-4">{subtitle}</p>
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => onSelect(i.id)}
              className={`group flex w-full items-center gap-3 rounded border px-3 py-2 text-left transition ${
                activeId === i.id
                  ? "border-action bg-action-soft"
                  : "border-rule bg-paper hover:border-action hover:bg-paper-2"
              }`}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-rule bg-paper-2 font-mono text-[11px] font-semibold uppercase tracking-tight text-ink-2"
                aria-hidden
              >
                {i.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink-1">
                    {i.name}
                  </span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.12em]"
                    style={{ color: STATUS_DOT[i.status] }}
                    aria-hidden
                  >
                    {DIR_GLYPH[i.direction]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${STATUS_TONE[i.status]}`}
                  >
                    {STATUS_LABEL[i.status]}
                  </span>
                  <span className="truncate text-[11px] text-ink-4">
                    {i.vendor}
                  </span>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetailPanel({
  integration,
  onClose,
}: {
  integration: Integration;
  onClose: () => void;
}) {
  const i = integration;
  return (
    <article className="rounded border border-action/40 bg-paper">
      <header className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
        <div className="flex items-start gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-rule bg-paper-2 font-mono text-sm font-semibold uppercase tracking-tight text-ink-1"
            aria-hidden
          >
            {i.glyph}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-ink-1">
                {i.name}
              </h2>
              <span
                className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_TONE[i.status]}`}
              >
                {STATUS_LABEL[i.status]}
              </span>
            </div>
            <p className="t-label mt-1">{i.vendor}</p>
            <p className="mt-3 max-w-2xl text-sm text-ink-2">
              {i.description}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="text-base text-ink-4 transition hover:text-bad"
        >
          ×
        </button>
      </header>

      {i.authNote && (
        <div className="border-b border-rule-soft px-6 py-3">
          <p className="t-label">Auth</p>
          <p className="text-xs text-ink-3">{i.authNote}</p>
        </div>
      )}

      <section className="border-b border-rule-soft px-6 py-5">
        <div className="section-head">
          <span className="t-label">Workflows · {i.workflows.length}</span>
          <span className="rule" />
        </div>
        <ul className="space-y-3">
          {i.workflows.map((w, idx) => (
            <li key={idx} className="grid grid-cols-[1fr_auto_1fr] gap-3">
              <div className="rounded border border-rule bg-paper-2 px-3 py-2">
                <p className="t-label mb-1">Trigger</p>
                <p className="text-sm text-ink-1">{w.trigger}</p>
              </div>
              <div className="self-center text-center font-mono text-sm text-ink-3">
                →
              </div>
              <div className="rounded border border-rule bg-paper-2 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="t-label mb-1">Aktion</p>
                  {w.enabled && (
                    <span className="font-mono text-[9px] uppercase tracking-wider text-action">
                      live
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink-1">{w.action}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-6 py-5">
        <div className="section-head">
          <span className="t-label">Feld-Mappings · {i.fieldMappings.length}</span>
          <span className="rule" />
        </div>
        {i.fieldMappings.length === 0 ? (
          <p className="text-sm italic text-ink-4">
            Kein strukturiertes Mapping — diese Integration arbeitet auf
            Event-Ebene, nicht auf einzelnen Feldern.
          </p>
        ) : (
          <ul className="overflow-hidden rounded border border-rule">
            <li className="grid grid-cols-[1fr_60px_1fr] gap-3 border-b border-rule bg-paper-2 px-3 py-2">
              <span className="t-label">ECHO</span>
              <span className="t-label text-center">Richtung</span>
              <span className="t-label">{i.vendor}</span>
            </li>
            {i.fieldMappings.map((m, idx) => (
              <li
                key={idx}
                className="grid grid-cols-[1fr_60px_1fr] gap-3 border-b border-rule-soft px-3 py-2 last:border-0 hover:bg-paper-2"
              >
                <code className="self-center font-mono text-xs text-ink-1">
                  {m.ours}
                </code>
                <span className="self-center text-center font-mono text-xs text-ink-3">
                  {m.direction === "in"
                    ? "←"
                    : m.direction === "out"
                      ? "→"
                      : m.direction === "both"
                        ? "↔"
                        : "·"}
                </span>
                <code className="self-center font-mono text-xs text-ink-1">
                  {m.theirs}
                </code>
                {m.note && (
                  <span className="col-span-3 text-[10px] text-ink-4">
                    {m.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
