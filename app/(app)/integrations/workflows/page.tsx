import { listWorkflows } from "@/lib/workflows";
import { createDemoWorkflow, createWorkflow } from "./actions";
import { WorkflowRow } from "./workflow-row";

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
              <WorkflowRow
                key={w.id}
                id={w.id}
                name={w.name}
                description={w.description}
                status={w.status}
                nodeCount={w.nodes.length}
                edgeCount={w.edges.length}
                updatedAt={w.updated_at}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
