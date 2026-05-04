"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  NODE_CATALOG,
  findTemplate,
  templatesByKind,
  type NodeTemplate,
} from "@/lib/workflow-catalog";
import type {
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowStatus,
} from "@/lib/types";
import { deleteWorkflow, saveWorkflowGraph } from "@/app/(app)/integrations/workflows/actions";

const KIND_TONE: Record<WorkflowNodeKind, string> = {
  trigger: "border-action bg-action-soft",
  filter: "border-signal bg-signal-soft",
  transform: "border-rule bg-paper-2",
  action: "border-good/40 bg-good/10",
};

const KIND_LABEL: Record<WorkflowNodeKind, string> = {
  trigger: "Trigger",
  filter: "Filter",
  transform: "Transform",
  action: "Action",
};

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  draft: "Entwurf",
  enabled: "Aktiv",
  disabled: "Deaktiviert",
};

interface NodeData extends Record<string, unknown> {
  kind: WorkflowNodeKind;
  subtype: string;
  label: string;
  description?: string;
  config: Record<string, unknown>;
}

type FlowNode = Node<NodeData>;
type FlowEdge = Edge;

const SIDES: Array<{ side: "top" | "right" | "bottom" | "left"; pos: Position }> = [
  { side: "top", pos: Position.Top },
  { side: "right", pos: Position.Right },
  { side: "bottom", pos: Position.Bottom },
  { side: "left", pos: Position.Left },
];

const HANDLE_STYLE: React.CSSProperties = {
  background: "var(--ink-3)",
  width: 8,
  height: 8,
  border: "1px solid var(--paper)",
};

function CustomNode({ data, selected }: NodeProps<FlowNode>) {
  const tpl = findTemplate(data.subtype);
  const live = tpl?.live ?? false;
  const stripeColor = live ? "var(--good)" : "var(--bad)";

  return (
    <div
      className={`relative min-w-44 overflow-hidden rounded border-2 ${KIND_TONE[data.kind]} ${
        selected ? "ring-2 ring-action ring-offset-2 ring-offset-paper" : ""
      }`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: stripeColor }}
      />

      {/* Source + target handle on every side, both with the same
          position. react-flow disambiguates source vs. target by what
          the user is doing (initiating vs. completing a connection).
          IDs are unique-per-side-per-type. */}
      {SIDES.map(({ side, pos }) => (
        <span key={side}>
          <Handle
            id={`${side}-target`}
            type="target"
            position={pos}
            style={HANDLE_STYLE}
            isConnectable
          />
          <Handle
            id={`${side}-source`}
            type="source"
            position={pos}
            style={HANDLE_STYLE}
            isConnectable
          />
        </span>
      ))}

      <div className="pl-3 pr-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[9px] uppercase tracking-wider text-ink-3">
            {KIND_LABEL[data.kind]}
          </p>
          <span
            className="font-mono text-[9px] uppercase tracking-wider"
            style={{ color: stripeColor }}
          >
            {live ? "Live" : "V2"}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-medium text-ink-1">{data.label}</p>
        {tpl?.description && (
          <p className="mt-1 text-[10px] leading-snug text-ink-4">
            {tpl.description}
          </p>
        )}
      </div>
    </div>
  );
}

const NODE_TYPES: NodeTypes = { custom: CustomNode };

function deserialize(workflow: Workflow): {
  nodes: FlowNode[];
  edges: FlowEdge[];
} {
  const nodes: FlowNode[] = (workflow.nodes ?? []).map((n: WorkflowNode) => ({
    id: n.id,
    type: "custom",
    position: n.position,
    data: n.data,
  }));
  const edges: FlowEdge[] = (workflow.edges ?? []).map((e: WorkflowEdge) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    data: e.data,
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
  return { nodes, edges };
}

function serialize(nodes: FlowNode[], edges: FlowEdge[]): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
} {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "custom",
      position: n.position,
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      data: (e.data ?? undefined) as
        | { mappings?: { from: string; to: string }[] }
        | undefined,
    })),
  };
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

interface MockResult {
  nodeId: string;
  label: string;
  output: Record<string, unknown> | string;
  status: "ok" | "skipped" | "error";
}

function runMock(
  nodes: FlowNode[],
  edges: FlowEdge[],
): MockResult[] {
  const results: MockResult[] = [];
  const triggers = nodes.filter((n) => n.data.kind === "trigger");

  for (const trigger of triggers) {
    const tpl = findTemplate(trigger.data.subtype);
    if (!tpl) continue;
    const triggerOutput: Record<string, unknown> = {};
    for (const f of tpl.outputFields) {
      triggerOutput[f] = `<sample:${f}>`;
    }
    results.push({
      nodeId: trigger.id,
      label: trigger.data.label,
      output: triggerOutput,
      status: "ok",
    });

    // Walk downstream
    let frontier: FlowNode[] = [trigger];
    let upstreamOutput: Record<string, unknown> = triggerOutput;
    const visited = new Set<string>([trigger.id]);

    while (frontier.length > 0) {
      const next: FlowNode[] = [];
      for (const current of frontier) {
        const outgoing = edges.filter((e) => e.source === current.id);
        for (const edge of outgoing) {
          const node = nodes.find((n) => n.id === edge.target);
          if (!node || visited.has(node.id)) continue;
          visited.add(node.id);
          const nodeTpl = findTemplate(node.data.subtype);
          if (!nodeTpl) {
            results.push({
              nodeId: node.id,
              label: node.data.label,
              output: "(unknown subtype)",
              status: "error",
            });
            continue;
          }

          if (node.data.kind === "filter") {
            results.push({
              nodeId: node.id,
              label: node.data.label,
              output: `Filter: ${describeConfig(node.data.config)}`,
              status: "ok",
            });
          } else if (node.data.kind === "transform") {
            const transformOut: Record<string, unknown> = {};
            for (const f of nodeTpl.outputFields) {
              transformOut[f] = `<transformed:${f}>`;
            }
            upstreamOutput = transformOut;
            results.push({
              nodeId: node.id,
              label: node.data.label,
              output: transformOut,
              status: "ok",
            });
          } else if (node.data.kind === "action") {
            results.push({
              nodeId: node.id,
              label: node.data.label,
              output: `(mock) ${node.data.label} mit ${describeConfig(node.data.config)}`,
              status: "ok",
            });
          }
          next.push(node);
        }
      }
      frontier = next;
    }
  }

  if (results.length === 0) {
    results.push({
      nodeId: "_",
      label: "Keine Trigger",
      output: "Füg einen Trigger hinzu, dann gibts hier was zu zeigen.",
      status: "skipped",
    });
  }
  return results;
}

function describeConfig(config: Record<string, unknown>): string {
  const entries = Object.entries(config).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return "(unkonfiguriert)";
  return entries.map(([k, v]) => `${k}=${String(v)}`).join(", ");
}

export function WorkflowEditor({ workflow }: { workflow: Workflow }) {
  return (
    <ReactFlowProvider>
      <EditorInner workflow={workflow} />
    </ReactFlowProvider>
  );
}

function EditorInner({ workflow }: { workflow: Workflow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(workflow.name);
  const [status, setStatus] = useState<WorkflowStatus>(workflow.status);
  const initial = useMemo(() => deserialize(workflow), [workflow]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mock, setMock] = useState<MockResult[] | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [vibePrompt, setVibePrompt] = useState("");
  const [vibing, setVibing] = useState(false);
  const [vibeError, setVibeError] = useState<string | null>(null);
  const [vibeSummary, setVibeSummary] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);

  async function runVibe() {
    if (!vibePrompt.trim()) return;
    if (
      nodes.length > 0 &&
      !confirm(
        "Vibe-Generate ersetzt den aktuellen Canvas. Speichere vorher wenn du willst. Fortfahren?",
      )
    ) {
      return;
    }
    setVibing(true);
    setVibeError(null);
    setVibeSummary(null);
    try {
      const res = await fetch("/api/workflows/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: vibePrompt }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Generate ${res.status}`);
      }
      const data = (await res.json()) as {
        summary: string;
        nodes: WorkflowNode[];
        edges: WorkflowEdge[];
        warnings: string[];
      };
      const flowNodes: FlowNode[] = data.nodes.map((n) => ({
        id: n.id,
        type: "custom",
        position: n.position,
        data: n.data,
      }));
      const flowEdges: FlowEdge[] = data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
        markerEnd: { type: MarkerType.ArrowClosed },
      }));
      setNodes(flowNodes);
      setEdges(flowEdges);
      setSelectedId(null);
      setMock(null);
      setVibeSummary(
        data.warnings.length > 0
          ? `${data.summary} · Hinweise: ${data.warnings.join(" / ")}`
          : data.summary,
      );
    } catch (err) {
      setVibeError(err instanceof Error ? err.message : "Generate fehlgeschlagen");
    } finally {
      setVibing(false);
    }
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          { ...connection, markerEnd: { type: MarkerType.ArrowClosed } },
          eds,
        ),
      ),
    [setEdges],
  );

  function addNodeFromTemplate(tpl: NodeTemplate) {
    const id = genId(tpl.kind);
    const newNode: FlowNode = {
      id,
      type: "custom",
      position: { x: 100 + nodes.length * 30, y: 80 + nodes.length * 30 },
      data: {
        kind: tpl.kind,
        subtype: tpl.subtype,
        label: tpl.label,
        description: tpl.description,
        config: {},
      },
    };
    setNodes((ns) => [...ns, newNode]);
    setSelectedId(id);
  }

  function updateSelectedConfig(key: string, value: string | number) {
    if (!selectedId) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selectedId
          ? {
              ...n,
              data: { ...n.data, config: { ...n.data.config, [key]: value } },
            }
          : n,
      ),
    );
  }

  function removeSelected() {
    if (!selectedId) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) =>
      es.filter((e) => e.source !== selectedId && e.target !== selectedId),
    );
    setSelectedId(null);
  }

  function save() {
    const payload = serialize(nodes, edges);
    start(async () => {
      try {
        await saveWorkflowGraph({
          id: workflow.id,
          name,
          status,
          nodes: payload.nodes,
          edges: payload.edges,
        });
        setSavedAt(new Date());
      } catch (err) {
        console.error(err);
      }
    });
  }

  function runTest() {
    setMock(runMock(nodes, edges));
  }

  async function destroy() {
    if (!confirm(`Workflow „${name}" wirklich löschen?`)) return;
    start(async () => {
      try {
        await deleteWorkflow(workflow.id);
      } catch (err) {
        console.error(err);
      }
    });
  }

  const tplOfSelected = selected ? findTemplate(selected.data.subtype) : null;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-rule bg-paper px-4 py-3">
        <button
          type="button"
          onClick={() => router.push("/integrations/workflows")}
          className="t-label hover:text-ink-1"
        >
          ← Workflows
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 border-0 bg-transparent text-base font-semibold tracking-tight text-ink-1 outline-none"
          placeholder="Workflow-Name"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as WorkflowStatus)}
          className="h-8 rounded border border-rule bg-paper px-2 text-xs"
        >
          {(["draft", "enabled", "disabled"] as WorkflowStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={runTest}
          className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action"
        >
          Test mit Sample
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
        >
          {pending ? "Speichere…" : savedAt ? "Gespeichert" : "Speichern"}
        </button>
        <button
          type="button"
          onClick={destroy}
          className="rounded border border-rule px-3 py-1.5 text-xs text-ink-3 transition hover:border-bad hover:text-bad"
        >
          Löschen
        </button>
      </div>

      {/* Vibe-Integrate bar */}
      <div className="border-b border-rule bg-action-soft px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="t-label" style={{ color: "var(--action)" }}>
            Vibe
          </span>
          <input
            type="text"
            value={vibePrompt}
            onChange={(e) => setVibePrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !vibing) {
                e.preventDefault();
                runVibe();
              }
            }}
            placeholder="Beschreib was passieren soll: „Wenn ich Kontakt erstelle, in HubSpot prüfen — wenn nicht da, dort anlegen."
            className="h-8 flex-1 rounded border border-action/30 bg-paper px-3 text-sm text-ink-1 outline-none placeholder:text-ink-4 focus:border-action focus:ring-2 focus:ring-action/20"
          />
          <button
            type="button"
            onClick={runVibe}
            disabled={vibing || !vibePrompt.trim()}
            className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
          >
            {vibing ? "Komponiere…" : "Generate"}
          </button>
        </div>
        {(vibeSummary || vibeError) && (
          <p
            className="mt-1.5 text-[11px]"
            style={{
              color: vibeError ? "var(--bad)" : "var(--ink-2)",
            }}
          >
            {vibeError ?? vibeSummary}
          </p>
        )}
      </div>

      <div className="grid flex-1 grid-cols-[220px_1fr_300px] overflow-hidden">
        {/* Library */}
        <aside className="overflow-y-auto border-r border-rule bg-paper-2 px-3 py-4">
          <p className="t-label mb-3">Library</p>
          {(["trigger", "filter", "transform", "action"] as WorkflowNodeKind[]).map(
            (kind) => (
              <section key={kind} className="mb-4">
                <p className="t-label mb-2" style={{ opacity: 0.7 }}>
                  {KIND_LABEL[kind]}
                </p>
                <ul className="space-y-1">
                  {templatesByKind(kind).map((tpl) => (
                    <li key={tpl.subtype}>
                      <button
                        type="button"
                        onClick={() => addNodeFromTemplate(tpl)}
                        className={`w-full rounded border ${KIND_TONE[tpl.kind]} px-2 py-1.5 text-left text-xs text-ink-1 transition hover:shadow-sm`}
                      >
                        {tpl.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
          <p className="t-label mt-6 mb-2">Tipps</p>
          <ul className="space-y-1 text-[11px] leading-relaxed text-ink-3">
            <li>· Klick = Node aufs Canvas</li>
            <li>· Vom unteren Punkt zum oberen ziehen = verbinden</li>
            <li>· Klick Node → Config rechts</li>
            <li>· Backspace löscht Selektion</li>
          </ul>
        </aside>

        {/* Canvas */}
        <div ref={dropRef} className="relative bg-paper">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={({ nodes: sel }) => {
              setSelectedId(sel[0]?.id ?? null);
            }}
            nodeTypes={NODE_TYPES}
            fitView
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background gap={16} size={1} color="var(--rule-soft)" />
            <Controls
              style={{
                background: "var(--paper)",
                border: "1px solid var(--rule)",
              }}
            />
            <MiniMap
              pannable
              zoomable
              style={{
                background: "var(--paper-2)",
                border: "1px solid var(--rule)",
              }}
              nodeColor={() => "#9c968b"}
              maskColor="rgba(20,17,13,0.05)"
            />
          </ReactFlow>
        </div>

        {/* Right panel */}
        <aside className="overflow-y-auto border-l border-rule bg-paper px-4 py-4">
          {selected && tplOfSelected ? (
            <ConfigPanel
              key={selected.id}
              template={tplOfSelected}
              config={selected.data.config}
              onChange={updateSelectedConfig}
              onRemove={removeSelected}
            />
          ) : mock ? (
            <MockPanel results={mock} onClear={() => setMock(null)} />
          ) : (
            <EmptyHint nodeCount={nodes.length} />
          )}
        </aside>
      </div>
    </div>
  );
}

function EmptyHint({ nodeCount }: { nodeCount: number }) {
  return (
    <div className="space-y-3">
      <p className="t-label">Konfiguration</p>
      <p className="text-xs text-ink-3">
        {nodeCount === 0
          ? "Wähl links eine Library-Karte. Sie landet auf dem Canvas."
          : "Klick einen Node auf dem Canvas, um seine Config zu öffnen. Oder Test-mit-Sample oben für einen Trockenlauf."}
      </p>
      <p className="t-label mt-6">Hinweis V1</p>
      <p className="text-xs text-ink-4">
        Designer-Modus. Das echte Ausführen (Cron, Webhook-Receiver,
        Action-Executor) kommt mit V2 — bis dahin zeigt „Test mit Sample" was
        passieren würde.
      </p>
    </div>
  );
}

function ConfigPanel({
  template,
  config,
  onChange,
  onRemove,
}: {
  template: NodeTemplate;
  config: Record<string, unknown>;
  onChange: (key: string, value: string | number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="t-label">{KIND_LABEL[template.kind]}</p>
        <h2 className="text-sm font-semibold text-ink-1">{template.label}</h2>
        <p className="mt-1 text-xs text-ink-3">{template.description}</p>
      </div>

      {template.outputFields.length > 0 && (
        <div>
          <p className="t-label mb-2">Output-Felder</p>
          <ul className="space-y-0.5">
            {template.outputFields.map((f) => (
              <li
                key={f}
                className="font-mono text-[11px] text-ink-2"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {template.configFields.length > 0 ? (
        <div className="space-y-3">
          <p className="t-label">Config</p>
          {template.configFields.map((f) => (
            <label key={f.key} className="block space-y-1">
              <span className="t-label">
                {f.label}
                {f.required && (
                  <span className="ml-1 text-action">*</span>
                )}
              </span>
              {f.type === "select" ? (
                <select
                  value={String(config[f.key] ?? "")}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  className="h-8 w-full rounded border border-rule bg-paper px-2 text-xs"
                >
                  <option value="">—</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  rows={4}
                  value={String(config[f.key] ?? "")}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full rounded border border-rule bg-paper px-2 py-1.5 text-xs text-ink-1 outline-none focus:border-action"
                />
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  value={String(config[f.key] ?? "")}
                  onChange={(e) =>
                    onChange(
                      f.key,
                      f.type === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                    )
                  }
                  placeholder={f.placeholder}
                  className="h-8 w-full rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action"
                />
              )}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs italic text-ink-4">Keine Config nötig.</p>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="text-xs text-ink-4 transition hover:text-bad"
      >
        × Node entfernen
      </button>
    </div>
  );
}

function MockPanel({
  results,
  onClear,
}: {
  results: MockResult[];
  onClear: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="t-label">Mock-Run</p>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-ink-4 transition hover:text-bad"
        >
          ×
        </button>
      </div>
      <ul className="space-y-2">
        {results.map((r, i) => (
          <li
            key={`${r.nodeId}-${i}`}
            className={`rounded border px-2 py-1.5 text-[11px] ${
              r.status === "ok"
                ? "border-action/30 bg-action-soft"
                : r.status === "skipped"
                  ? "border-rule bg-paper-2"
                  : "border-bad/30 bg-bad/5"
            }`}
          >
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
              {r.label}
            </p>
            <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[10px] text-ink-1">
              {typeof r.output === "string"
                ? r.output
                : JSON.stringify(r.output, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Used to compute total catalog size for diagnostics — pulled in so
// the catalog import isn't pruned by tree-shaking.
export const CATALOG_SIZE = NODE_CATALOG.length;
