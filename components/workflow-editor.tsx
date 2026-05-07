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
  getBezierPath,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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

// Per-kind tone tokens — used for the glyph badge + minimap colour.
// We mirror the integrations canvas where each node has a coloured
// glyph and the rest of the card stays paper.
const KIND_TONE: Record<
  WorkflowNodeKind,
  { stroke: string; fill: string; glyph: string }
> = {
  trigger: {
    stroke: "var(--action)",
    fill: "var(--action-soft)",
    glyph: "TR",
  },
  filter: {
    stroke: "oklch(72% 0.13 75)",
    fill: "oklch(96% 0.04 80)",
    glyph: "FI",
  },
  transform: {
    stroke: "var(--ink-3)",
    fill: "var(--paper-2)",
    glyph: "TX",
  },
  action: {
    stroke: "oklch(58% 0.10 145)",
    fill: "oklch(94% 0.04 145)",
    glyph: "AC",
  },
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
  const tone = KIND_TONE[data.kind];
  const liveColor = live ? "oklch(58% 0.10 145)" : "oklch(58% 0.14 25)";

  return (
    <div
      className={`relative flex w-56 items-start gap-3 rounded border bg-paper px-3 py-2.5 shadow-sm transition ${
        selected
          ? "border-action shadow-[0_0_0_3px_var(--action-ring)]"
          : "border-rule"
      }`}
    >
      {/* Source + target handles on every side. ReactFlow disambiguates
          by direction of the user's drag. IDs stay unique per side/type. */}
      {SIDES.map(({ side, pos }) => (
        <span key={side}>
          <Handle
            id={`${side}-target`}
            type="target"
            position={pos}
            style={{ ...HANDLE_STYLE, background: tone.stroke }}
            isConnectable
          />
          <Handle
            id={`${side}-source`}
            type="source"
            position={pos}
            style={{ ...HANDLE_STYLE, background: tone.stroke }}
            isConnectable
          />
        </span>
      ))}

      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded font-mono text-[11px] font-semibold uppercase tracking-tight"
        style={{
          background: tone.fill,
          color: tone.stroke,
          border: `1px solid ${tone.stroke}`,
        }}
      >
        {tone.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-ink-1">
            {data.label}
          </span>
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: liveColor }}
            title={live ? "Live" : "V2 (geplant)"}
          />
        </div>
        <span className="block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          {KIND_LABEL[data.kind]}
        </span>
        {tpl?.description && (
          <span className="mt-1 block text-[10px] leading-snug text-ink-4">
            {tpl.description}
          </span>
        )}
      </div>
    </div>
  );
}

const NODE_TYPES: NodeTypes = { custom: CustomNode };

// Edge type that matches the integrations canvas — bezier path, with
// a travelling dot + glow when the workflow is enabled. Falls back to
// a static muted stroke when draft / disabled.
function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<Edge<{ flowing?: boolean }>>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const flowing = !!data?.flowing;
  const stroke = flowing ? "oklch(58% 0.10 145)" : "var(--ink-4)";
  const width = selected ? 2.5 : flowing ? 2 : 1.25;

  return (
    <>
      <path
        id={id}
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={flowing ? undefined : "4 4"}
        strokeOpacity={flowing ? 1 : 0.7}
      />
      {flowing && (
        <>
          <circle r={3} fill={stroke}>
            <animateMotion dur="2.4s" repeatCount="indefinite">
              <mpath href={`#${id}`} />
            </animateMotion>
          </circle>
          <circle r={5} fill={stroke} fillOpacity={0.25}>
            <animateMotion dur="2.4s" repeatCount="indefinite">
              <mpath href={`#${id}`} />
            </animateMotion>
          </circle>
        </>
      )}
    </>
  );
}

const EDGE_TYPES: EdgeTypes = { flow: FlowEdge };

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
  const flowing = workflow.status === "enabled";
  const edges: FlowEdge[] = (workflow.edges ?? []).map((e: WorkflowEdge) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    type: "flow",
    data: { ...(e.data ?? {}), flowing },
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

  const flowing = status === "enabled";

  // Keep edge `flowing` in sync with the current status — toggling the
  // status segment from the toolbar should immediately animate the
  // travelling dots without a save/reload.
  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        type: "flow",
        data: { ...(e.data ?? {}), flowing },
      })),
    );
  }, [flowing, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "flow",
            data: { flowing },
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds,
        ),
      ),
    [setEdges, flowing],
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
            edgeTypes={EDGE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={["Backspace", "Delete"]}
            minZoom={0.4}
            maxZoom={1.6}
          >
            <Background gap={24} size={1} color="var(--rule-soft)" />
            <Controls
              showInteractive={false}
              className="!bg-paper !border !border-rule"
            />
            <MiniMap
              pannable
              zoomable
              maskColor="oklch(94% 0.012 90 / 0.6)"
              nodeColor={(n) => {
                const data = n.data as NodeData | undefined;
                if (!data?.kind) return "var(--ink-4)";
                return KIND_TONE[data.kind].stroke;
              }}
              className="!bg-paper-2 !border !border-rule"
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
