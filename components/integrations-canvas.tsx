"use client";

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState } from "react";
import {
  INTEGRATIONS,
  type Integration,
  type IntegrationStatus,
} from "@/lib/integrations";
import { APP_CONFIG } from "@/lib/config";

// ───────── colour map ─────────
// connected = green (data is flowing). planned/available = gray.
// "error" path is wired into the type system so a future health check
// can flip nodes to red without rewriting the component.
const STATUS_TONE: Record<IntegrationStatus, { stroke: string; fill: string; label: string }> = {
  connected: {
    stroke: "oklch(58% 0.10 145)",
    fill: "oklch(94% 0.04 145)",
    label: "Aktiv",
  },
  available: {
    stroke: "var(--ink-3)",
    fill: "var(--paper-2)",
    label: "Verfügbar",
  },
  planned: {
    stroke: "var(--ink-4)",
    fill: "var(--paper)",
    label: "Geplant",
  },
};

const ERROR_STROKE = "oklch(58% 0.14 25)";

// ───────── ECHO hub node ─────────
function EchoHubNode() {
  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "transparent", border: 0 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: "transparent", border: 0 }}
      />
      <div className="relative flex h-44 w-44 flex-col items-center justify-center rounded-full border-2 border-action bg-action-soft text-center shadow-[0_0_0_8px_oklch(95%_0.012_250)]">
        <span className="font-serif text-2xl font-semibold tracking-tight text-ink-1">
          {APP_CONFIG.PUBLIC_NAME}
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

// ───────── Integration node ─────────
interface IntegrationNodeData extends Record<string, unknown> {
  integration: Integration;
  selected: boolean;
  side: "left" | "right";
}

function IntegrationNode({ data }: NodeProps<Node<IntegrationNodeData>>) {
  const i = data.integration;
  const tone = STATUS_TONE[i.status];

  // Inbound nodes connect from their RIGHT to ECHO's LEFT.
  // Outbound nodes connect from ECHO's RIGHT to their LEFT.
  const handlePosition = data.side === "left" ? Position.Right : Position.Left;
  const handleType = data.side === "left" ? "source" : "target";

  return (
    <div
      className={`relative flex w-52 cursor-pointer items-center gap-3 rounded border bg-paper px-3 py-2.5 shadow-sm transition ${
        data.selected
          ? "border-action shadow-[0_0_0_3px_var(--action-ring)]"
          : "border-rule hover:border-action"
      }`}
    >
      <Handle
        id="port"
        type={handleType}
        position={handlePosition}
        style={{
          background: tone.stroke,
          width: 8,
          height: 8,
          border: 0,
        }}
      />
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded font-mono text-[11px] font-semibold uppercase tracking-tight"
        style={{
          background: tone.fill,
          color: tone.stroke,
          border: `1px solid ${tone.stroke}`,
        }}
      >
        {i.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-ink-1">
            {i.name}
          </span>
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: tone.stroke }}
          />
        </div>
        <span className="block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          {i.vendor}
        </span>
      </div>
    </div>
  );
}

// ───────── Animated edge with travelling dot ─────────
function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<Edge<{ status: IntegrationStatus; label: string }>>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const tone = STATUS_TONE[data?.status ?? "planned"];
  const isActive = data?.status === "connected";

  return (
    <>
      <path
        id={id}
        d={path}
        fill="none"
        stroke={tone.stroke}
        strokeWidth={isActive ? 2 : 1.25}
        strokeDasharray={isActive ? undefined : "4 4"}
        strokeOpacity={isActive ? 1 : 0.6}
      />
      {isActive && (
        <>
          {/* Travelling dot */}
          <circle r={3} fill={tone.stroke}>
            <animateMotion dur="2.4s" repeatCount="indefinite">
              <mpath href={`#${id}`} />
            </animateMotion>
          </circle>
          {/* Soft glow trailing the dot */}
          <circle r={5} fill={tone.stroke} fillOpacity={0.25}>
            <animateMotion dur="2.4s" repeatCount="indefinite">
              <mpath href={`#${id}`} />
            </animateMotion>
          </circle>
        </>
      )}
      {/* Mid-path label */}
      {data?.label && (
        <text
          dy={-4}
          textAnchor="middle"
          className="fill-current font-mono text-[9px] uppercase tracking-wider"
          style={{ fill: "var(--ink-3)" }}
        >
          <textPath href={`#${id}`} startOffset="50%">
            {data.label}
          </textPath>
        </text>
      )}
    </>
  );
}

// We register node + edge types outside render so React Flow's ref
// equality keeps the canvas from re-mounting on every render.
const NODE_TYPES = {
  echo: EchoHubNode,
  integration: IntegrationNode,
};

const EDGE_TYPES = {
  flow: FlowEdge,
};

// Dummy reference so the linter doesn't strip the unused-but-named
// hub node import path during refactors.
void ERROR_STROKE;

export function IntegrationsCanvas() {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Lay nodes out in two columns either side of the ECHO hub. We
  // pre-compute positions because React Flow's auto-layout would
  // require dagre and we don't want the dependency for ~12 nodes.
  const { nodes, edges } = useMemo(() => {
    const inbound = INTEGRATIONS.filter(
      (i) => i.direction === "inbound" || i.direction === "both",
    );
    const outbound = INTEGRATIONS.filter(
      (i) => i.direction === "outbound" || i.direction === "both",
    );

    const COL_X_LEFT = 40;
    const COL_X_RIGHT = 700;
    const HUB_X = 380;
    const ROW_GAP = 90;
    const TOP_PAD = 40;

    const inboundCount = inbound.length;
    const outboundCount = outbound.length;
    const taller = Math.max(inboundCount, outboundCount);
    const totalHeight = taller * ROW_GAP + TOP_PAD * 2;
    const HUB_Y = totalHeight / 2 - 80;

    const inboundOffset = (taller - inboundCount) * ROW_GAP * 0.5;
    const outboundOffset = (taller - outboundCount) * ROW_GAP * 0.5;

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    nodes.push({
      id: "echo",
      type: "echo",
      position: { x: HUB_X, y: HUB_Y },
      draggable: false,
      data: {},
    });

    inbound.forEach((i, idx) => {
      const id = `in-${i.id}`;
      nodes.push({
        id,
        type: "integration",
        position: {
          x: COL_X_LEFT,
          y: TOP_PAD + inboundOffset + idx * ROW_GAP,
        },
        data: {
          integration: i,
          selected: activeId === i.id,
          side: "left",
        } satisfies IntegrationNodeData,
      });
      edges.push({
        id: `e-in-${i.id}`,
        source: id,
        sourceHandle: "port",
        target: "echo",
        targetHandle: "in",
        type: "flow",
        data: {
          status: i.status,
          label:
            i.workflows[0]?.action?.split(/\s|→/)[0] ??
            (i.direction === "both" ? "sync" : "in"),
        },
      });
    });

    outbound.forEach((i, idx) => {
      const id = `out-${i.id}`;
      nodes.push({
        id,
        type: "integration",
        position: {
          x: COL_X_RIGHT,
          y: TOP_PAD + outboundOffset + idx * ROW_GAP,
        },
        data: {
          integration: i,
          selected: activeId === i.id,
          side: "right",
        } satisfies IntegrationNodeData,
      });
      edges.push({
        id: `e-out-${i.id}`,
        source: "echo",
        sourceHandle: "out",
        target: id,
        targetHandle: "port",
        type: "flow",
        data: {
          status: i.status,
          label:
            i.workflows[0]?.action?.split(/\s|→/)[0] ??
            (i.direction === "both" ? "sync" : "out"),
        },
      });
    });

    return { nodes, edges };
  }, [activeId]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const data = node.data as IntegrationNodeData | undefined;
      if (!data?.integration) return;
      setActiveId((prev) =>
        prev === data.integration.id ? null : data.integration.id,
      );
    },
    [],
  );

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      // The integration ID is encoded in the edge id (e-in-<id> / e-out-<id>)
      const id = edge.id.replace(/^e-(in|out)-/, "");
      setActiveId((prev) => (prev === id ? null : id));
    },
    [],
  );

  const active = activeId
    ? INTEGRATIONS.find((i) => i.id === activeId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div className="h-[640px] overflow-hidden rounded border border-rule bg-paper">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            edgesReconnectable={false}
            panOnScroll
            zoomOnScroll
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
                const data = n.data as IntegrationNodeData | undefined;
                if (!data?.integration) return "var(--action)";
                return STATUS_TONE[data.integration.status].stroke;
              }}
              className="!bg-paper-2 !border !border-rule"
            />
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      <Legend />

      {active ? (
        <DetailPanel integration={active} onClose={() => setActiveId(null)} />
      ) : (
        <div className="rounded border border-rule bg-paper-2 px-6 py-10 text-center">
          <p className="t-label mb-2">Wähle eine Integration</p>
          <p className="text-sm text-ink-3">
            Klick einen Knoten oder eine Kante an — du siehst Workflows und
            Feld-Mapping. Nodes lassen sich frei verschieben, der Hintergrund
            mit Trackpad zoomen und pannen.
          </p>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded border border-rule bg-paper-2 px-4 py-3 text-xs">
      {(["connected", "available", "planned"] as IntegrationStatus[]).map(
        (s) => {
          const tone = STATUS_TONE[s];
          return (
            <div key={s} className="flex items-center gap-2">
              <span
                className="h-2 w-6 rounded-full"
                style={{
                  background: tone.stroke,
                  opacity: s === "connected" ? 1 : 0.6,
                }}
                aria-hidden
              />
              <span className="t-label">{tone.label}</span>
            </div>
          );
        },
      )}
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-6 rounded-full"
          style={{ background: ERROR_STROKE }}
          aria-hidden
        />
        <span className="t-label">Fehler</span>
      </div>
      <div className="ml-auto flex items-center gap-2 text-ink-4">
        <span className="font-mono text-[10px] uppercase tracking-wider">
          Drag zum Bewegen · Trackpad zum Zoomen · Klick = Details
        </span>
      </div>
    </div>
  );
}

// ───────── Detail panel (kept similar to the previous static version) ─────────
function DetailPanel({
  integration,
  onClose,
}: {
  integration: Integration;
  onClose: () => void;
}) {
  const i = integration;
  const tone = STATUS_TONE[i.status];

  return (
    <article className="rounded border border-action/40 bg-paper">
      <header className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
        <div className="flex items-start gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded font-mono text-sm font-semibold uppercase tracking-tight"
            style={{
              background: tone.fill,
              color: tone.stroke,
              border: `1px solid ${tone.stroke}`,
            }}
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
                className="rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
                style={{
                  background: tone.fill,
                  borderColor: tone.stroke,
                  color: tone.stroke,
                }}
              >
                {tone.label}
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
              <span className="t-label">{APP_CONFIG.PUBLIC_NAME}</span>
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
