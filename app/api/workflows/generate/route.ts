import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/claude";
import { getUserContext } from "@/lib/user-context";
import { NODE_CATALOG, findTemplate } from "@/lib/workflow-catalog";
import type { WorkflowEdge, WorkflowNode } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface GenerateRequest {
  prompt: string;
}

let sharedClient: Anthropic | null = null;
function getClient(apiKey?: string | null): Anthropic {
  if (apiKey) return new Anthropic({ apiKey });
  if (!sharedClient) {
    sharedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return sharedClient;
}

const TOOL: Anthropic.Tool = {
  name: "compose_workflow",
  description:
    "Komponiere einen Workflow aus dem ECHO Node-Catalog. Wähle nur Nodes deren subtype in der Catalog-Liste vorkommt — keine erfundenen Node-Typen. Verbinde Trigger → optional Filter → optional Transform → Action via edges (using node array indices).",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Ein Satz, was der Workflow macht.",
      },
      nodes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            subtype: {
              type: "string",
              description:
                "Eindeutige Catalog-Subtype-ID, z.B. 'trigger.person_created' oder 'action.lookup_hubspot'.",
            },
            label: {
              type: "string",
              description: "Kurze sprechende Beschriftung (max 24 Zeichen).",
            },
            config: {
              type: "object",
              description:
                "Key-Value-Map mit den configFields aus dem Catalog. Lass Felder weg die nicht relevant sind.",
            },
          },
          required: ["subtype"],
        },
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from_index: {
              type: "integer",
              description: "Index in nodes-Array (0-basiert) — Source.",
            },
            to_index: {
              type: "integer",
              description: "Index in nodes-Array (0-basiert) — Target.",
            },
          },
          required: ["from_index", "to_index"],
        },
      },
    },
    required: ["summary", "nodes", "edges"],
  },
};

function buildSystemPrompt(): string {
  const lines: string[] = [
    "Du komponierst Workflows für ECHO, einen Personal CRM. Der Nutzer beschreibt in natürlicher Sprache was passieren soll, du baust den Graph aus dem vorgegebenen Node-Catalog.",
    "",
    "Verfügbarer Catalog (nur diese subtypes nutzen):",
    "",
  ];

  for (const t of NODE_CATALOG) {
    const cfgKeys = t.configFields.map((c) => c.key).join(", ");
    lines.push(
      `- ${t.subtype} [${t.kind}${t.live ? " · live" : " · v2"}]: ${t.label} — ${t.description}${
        cfgKeys ? ` Config-Keys: ${cfgKeys}.` : ""
      }`,
    );
  }

  lines.push(
    "",
    "Regeln:",
    "- Workflow MUSS mit mindestens einem Trigger anfangen.",
    "- Filter und Transform sind optional zwischen Trigger und Action.",
    "- Endet mit mindestens einer Action.",
    "- Edges referenzieren Node-Indizes (0-basiert) im selben Tool-Call.",
    "- Wenn der Nutzer ein externes System wie HubSpot, LinkedIn, Email oder Webhooks erwähnt, nutze die entsprechenden Action-Nodes auch wenn sie aktuell 'v2' sind — der User sieht den roten Live-Status und weiß, dass es noch nicht ausführt.",
    "- 'Wenn X erstellt' → trigger.person_created. 'Wenn X aktualisiert' → trigger.person_updated.",
    "- 'Prüfen ob existiert' bei externen Systemen → entsprechender lookup-Node (action.lookup_hubspot etc.).",
    "- Config-Felder ausfüllen wo der User konkrete Werte nennt; sonst leerlassen oder Platzhalter.",
    "- Niemals subtype erfinden. Wenn ein Schritt nicht abbildbar ist, beschreib das im summary.",
  );

  return lines.join("\n");
}

interface ComposeOutput {
  summary: string;
  nodes: { subtype: string; label?: string; config?: Record<string, unknown> }[];
  edges: { from_index: number; to_index: number }[];
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  try {
    const response = await getClient(ctx.claude_key).messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "compose_workflow" },
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: prompt }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) {
      return NextResponse.json({ error: "no workflow" }, { status: 500 });
    }

    const composed = toolUse.input as ComposeOutput;
    const result = realizeWorkflow(composed);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "generate failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function realizeWorkflow(composed: ComposeOutput): {
  summary: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const nodes: WorkflowNode[] = [];
  const indexToId = new Map<number, string>();

  for (let i = 0; i < (composed.nodes ?? []).length; i++) {
    const raw = composed.nodes[i];
    const tpl = findTemplate(raw.subtype);
    if (!tpl) {
      warnings.push(`Subtype unbekannt: ${raw.subtype} — übersprungen.`);
      continue;
    }
    const id = genId(tpl.kind);
    indexToId.set(i, id);
    nodes.push({
      id,
      type: "custom",
      position: { x: 0, y: 0 }, // computed below
      data: {
        kind: tpl.kind,
        subtype: tpl.subtype,
        label: raw.label?.slice(0, 60) ?? tpl.label,
        description: tpl.description,
        config: (raw.config ?? {}) as Record<string, unknown>,
      },
    });
  }

  const edges: WorkflowEdge[] = [];
  for (const e of composed.edges ?? []) {
    const sId = indexToId.get(e.from_index);
    const tId = indexToId.get(e.to_index);
    if (!sId || !tId) continue;
    edges.push({
      id: genId("edge"),
      source: sId,
      target: tId,
      sourceHandle: "bottom-source",
      targetHandle: "top-target",
    });
  }

  layoutNodes(nodes, edges);

  return { summary: composed.summary ?? "", nodes, edges, warnings };
}

// BFS-style layered layout: column = max depth from any trigger, row =
// sibling index inside the column.
function layoutNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): void {
  const colByNode = new Map<string, number>();
  const triggers = nodes.filter((n) => n.data.kind === "trigger");
  for (const t of triggers) colByNode.set(t.id, 0);
  if (triggers.length === 0 && nodes.length > 0) {
    colByNode.set(nodes[0].id, 0);
  }

  let frontier = nodes.filter((n) => colByNode.has(n.id));
  while (frontier.length > 0) {
    const next: WorkflowNode[] = [];
    for (const n of frontier) {
      const downstream = edges.filter((e) => e.source === n.id);
      for (const e of downstream) {
        const target = nodes.find((x) => x.id === e.target);
        if (!target) continue;
        const proposed = (colByNode.get(n.id) ?? 0) + 1;
        const existing = colByNode.get(target.id);
        if (existing == null || proposed > existing) {
          colByNode.set(target.id, proposed);
          next.push(target);
        }
      }
    }
    frontier = next;
  }

  // Any nodes still missing a column (orphans) go to col 0 below the
  // triggers.
  for (const n of nodes) {
    if (!colByNode.has(n.id)) colByNode.set(n.id, 0);
  }

  const byCol = new Map<number, WorkflowNode[]>();
  for (const n of nodes) {
    const col = colByNode.get(n.id) ?? 0;
    if (!byCol.has(col)) byCol.set(col, []);
    byCol.get(col)!.push(n);
  }

  for (const [col, list] of byCol) {
    list.forEach((n, row) => {
      n.position = { x: col * 300, y: row * 160 };
    });
  }
}
