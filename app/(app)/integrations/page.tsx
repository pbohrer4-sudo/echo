import { IntegrationsCanvas } from "@/components/integrations-canvas";
import { INTEGRATIONS } from "@/lib/integrations";

export default function IntegrationsPage() {
  const total = INTEGRATIONS.length;
  const connected = INTEGRATIONS.filter(
    (i) => i.status === "connected",
  ).length;
  const planned = INTEGRATIONS.filter((i) => i.status === "planned").length;

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="space-y-2">
          <p className="t-label">Datenfluss</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Integrationen
          </h1>
          <p className="max-w-2xl text-sm text-ink-3">
            Welche Systeme spielen Daten in ECHO, welche bekommen sie raus.
            Klick eine Integration an — du siehst alle Workflows und das
            Feld-Mapping zur Gegenseite.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="rounded border border-action/40 bg-action-soft px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-action">
              {connected} aktiv
            </span>
            <span className="rounded border border-rule-soft bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              {planned} geplant
            </span>
            <span className="rounded border border-rule-soft bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-4">
              {total} insgesamt
            </span>
          </div>
        </header>

        <IntegrationsCanvas />
      </div>
    </div>
  );
}
