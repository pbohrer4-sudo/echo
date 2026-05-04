import Link from "next/link";
import { listWorkflows } from "@/lib/workflows";
import { createDemoWorkflow, createWorkflow } from "./actions";

const STATUS_TONE: Record<string, string> = {
  draft: "border-rule bg-paper-2 text-ink-3",
  enabled: "border-action/40 bg-action-soft text-action",
  disabled: "border-bad/30 bg-bad/5 text-bad",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf",
  enabled: "Aktiv",
  disabled: "Deaktiviert",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function WorkflowsListPage() {
  const workflows = await listWorkflows();

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <p className="t-label">Visual Editor</p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
              Workflows
            </h1>
            <p className="max-w-xl text-sm text-ink-3">
              Trigger → Filter → Transform → Action. Designer-Modus —
              Ausführungs-Engine kommt mit V2.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <form action={createDemoWorkflow}>
              <button
                type="submit"
                className="rounded border border-rule px-3 py-2 text-sm text-ink-2 transition hover:border-action hover:text-action"
              >
                + Demo
              </button>
            </form>
            <form action={createWorkflow}>
              <input type="hidden" name="name" value="Neuer Workflow" />
              <button
                type="submit"
                className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
              >
                + Workflow
              </button>
            </form>
          </div>
        </header>

        {workflows.length === 0 ? (
          <div className="rounded border border-rule bg-paper-2 px-6 py-16 text-center">
            <p className="t-label mb-2">Noch keine Workflows</p>
            <p className="mx-auto max-w-md text-sm text-ink-3">
              Beispiel: Wenn Person mit Tag „Tennis" angelegt wird → Reminder
              für Sonntag in 7 Tagen → Webhook an Calendar. Klick „+ Workflow"
              um anzufangen.
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded border border-rule bg-paper">
            {workflows.map((w) => (
              <li
                key={w.id}
                className="border-b border-rule-soft last:border-0"
              >
                <Link
                  href={`/integrations/workflows/${w.id}`}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-4 transition hover:bg-paper-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-1">
                      {w.name}
                    </p>
                    {w.description && (
                      <p className="truncate text-xs text-ink-4">
                        {w.description}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
                      {w.nodes.length} Nodes · {w.edges.length} Verbindungen
                    </p>
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_TONE[w.status]}`}
                  >
                    {STATUS_LABEL[w.status]}
                  </span>
                  <span className="font-mono text-xs text-ink-3">
                    {fmtDate(w.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
