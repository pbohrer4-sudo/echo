"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import type { PersonGraph } from "@/lib/graph";

// Cytoscape-rendered ego graph. Focus node centred, neighbours arranged
// by the cose (compound spring embedder) layout — heavier edges pull
// nodes closer. Click a node → navigate to that person's graph (re-roots
// the graph on them). Reads design tokens from CSS vars so it matches
// the Ledger × Geist palette.

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export function PersonGraphCanvas({ graph }: { graph: PersonGraph }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [hover, setHover] = useState<{
    label: string;
    reasons: string[];
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const action = cssVar("--action", "#3b5bdb");
    const ink1 = cssVar("--ink-1", "#1a1a1a");
    const rule = cssVar("--rule", "#d8d8d8");
    const paper = cssVar("--paper", "#fafafa");

    const elements: ElementDefinition[] = [
      ...graph.nodes.map((n) => ({
        data: { id: n.id, label: n.label, kind: n.kind, weight: n.weight },
      })),
      ...graph.edges.map((e) => ({
        data: {
          id: `${e.source}->${e.target}`,
          source: e.source,
          target: e.target,
          weight: e.weight,
          reasons: e.reasons.join(" · "),
        },
      })),
    ];

    const cy: Core = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "font-size": 11,
            "font-family": "var(--font-geist), sans-serif",
            color: ink1,
            "text-valign": "bottom",
            "text-margin-y": 4,
            "background-color": paper,
            "border-color": rule,
            "border-width": 1.5,
            width: 18,
            height: 18,
          },
        },
        {
          selector: 'node[kind = "focus"]',
          style: {
            "background-color": action,
            "border-color": action,
            width: 30,
            height: 30,
            "font-size": 13,
            "font-weight": 600,
            color: ink1,
          },
        },
        {
          selector: "edge",
          style: {
            "curve-style": "straight",
            "line-color": rule,
            width: "mapData(weight, 1, 15, 1, 4)",
            "target-arrow-shape": "none",
            opacity: 0.7,
          },
        },
        {
          selector: "node:active, node.hl",
          style: { "border-color": action, "border-width": 2.5 },
        },
      ],
      layout: {
        name: "cose",
        animate: false,
        padding: 40,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 90,
      },
      minZoom: 0.2,
      maxZoom: 2.5,
      wheelSensitivity: 0.2,
    });

    // Hover tooltip from edge reasons.
    cy.on("mouseover", "node", (evt) => {
      const node = evt.target;
      if (node.data("kind") === "focus") {
        setHover(null);
        return;
      }
      const edge = cy.getElementById(`${graph.focusId}->${node.id()}`);
      setHover({
        label: node.data("label"),
        reasons: edge.nonempty() ? String(edge.data("reasons")).split(" · ") : [],
      });
    });
    cy.on("mouseout", "node", () => setHover(null));

    // Click a non-focus node → re-root the graph on that person.
    cy.on("tap", "node", (evt) => {
      const node = evt.target;
      if (node.data("kind") === "focus") return;
      router.push(`/people/${node.id()}/graph`);
    });

    return () => cy.destroy();
  }, [graph, router]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[70vh] w-full rounded border border-rule bg-paper-2"
      />
      {hover && (
        <div className="pointer-events-none absolute left-3 top-3 max-w-xs rounded border border-rule bg-paper px-3 py-2 text-sm shadow-md">
          <p className="font-medium text-ink-1">{hover.label}</p>
          {hover.reasons.length > 0 && (
            <p className="mt-1 text-xs text-ink-3">
              {hover.reasons.join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
