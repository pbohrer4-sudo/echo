import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/claude";
import { getUserContext } from "@/lib/user-context";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { mapAnthropicError } from "@/lib/anthropic-error";
import { createClient } from "@/lib/supabase/server";
import { logAnthropic } from "@/lib/llm-usage";

export const runtime = "nodejs";
export const maxDuration = 30;

interface EnrichRequest {
  name: string;
  domain?: string;
}

interface EnrichResult {
  industry: string | null;
  website: string | null;
  domain: string | null;
  size: string | null;
  hq: string | null;
  description: string | null;
  tags: string[];
  confidence: "high" | "medium" | "low";
  uncertain: boolean;
}

const TOOL: Anthropic.Tool = {
  name: "enrich_organization",
  description:
    "Reichere die Stammdaten zu einer Organisation an. Nutze nur Wissen aus deinem Training — wenn du dir nicht sicher bist, lass das Feld weg statt zu raten. Setze 'uncertain' auf true wenn du den Namen nicht eindeutig identifizieren kannst.",
  input_schema: {
    type: "object",
    properties: {
      industry: {
        type: "string",
        description:
          "Branche, möglichst spezifisch. Beispiele: 'SaaS · Payments', 'Architektur', 'Maschinenbau · Mittelstand'.",
      },
      website: {
        type: "string",
        description: "Volle URL inkl. https://, falls bekannt.",
      },
      domain: {
        type: "string",
        description: "Bare Domain ohne Protokoll, z.B. stripe.com.",
      },
      size: {
        type: "string",
        description:
          "Grobe Größe: 'Solo', '<10', '10-50', '50-250', '250-1000', '>1000', 'Konzern'.",
      },
      hq: {
        type: "string",
        description: "Hauptsitz wie 'San Francisco, CA' oder 'Berlin'.",
      },
      description: {
        type: "string",
        description:
          "1-2 Sätze, was die Organisation tut. Ohne Marketing-Sprache.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description:
          "2-4 Schlagwort-Tags zur Klassifizierung. Beispiele: 'B2B', 'Open Source', 'Konkurrent'.",
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description:
          "high = bekannte Org, eindeutig. medium = wahrscheinlich, aber Name könnte ambig sein. low = wenig Wissen, vorsichtig.",
      },
      uncertain: {
        type: "boolean",
        description:
          "true wenn der Name keinen klaren Match hat — dann lieber leer lassen als raten.",
      },
    },
    required: ["confidence", "uncertain"],
  },
};

let sharedClient: Anthropic | null = null;
function getClient(apiKey?: string | null): Anthropic {
  if (apiKey) return new Anthropic({ apiKey });
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (!envKey) throw new Error("Kein Anthropic-Key konfiguriert");
  if (!sharedClient) {
    sharedClient = new Anthropic({ apiKey: envKey });
  }
  return sharedClient;
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit({
    userId: ctx.user_id,
    key: "ai_enrich",
    ...LIMITS.ai_enrich,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen — kurz warten." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: EnrichRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const userMessage = body.domain
    ? `Recherchiere die Organisation "${name}" (Domain: ${body.domain}). Fülle das Tool nur mit Daten, die du wirklich weißt.`
    : `Recherchiere die Organisation "${name}". Fülle das Tool nur mit Daten, die du wirklich weißt.`;

  const supabase = await createClient();
  const startMs = Date.now();
  try {
    const response = await getClient(ctx.claude_key).messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "enrich_organization" },
      messages: [{ role: "user", content: userMessage }],
    });
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/enrich-organization",
      model: CLAUDE_MODEL,
      usage: response.usage,
      latencyMs: Date.now() - startMs,
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) {
      return NextResponse.json({ error: "no enrichment data" }, { status: 500 });
    }

    const input = toolUse.input as Partial<EnrichResult>;
    const result: EnrichResult = {
      industry: stringOrNull(input.industry),
      website: stringOrNull(input.website),
      domain: stringOrNull(input.domain),
      size: stringOrNull(input.size),
      hq: stringOrNull(input.hq),
      description: stringOrNull(input.description),
      tags: Array.isArray(input.tags)
        ? input.tags.filter((t): t is string => typeof t === "string" && t.length > 0)
        : [],
      confidence:
        input.confidence === "high" ||
        input.confidence === "medium" ||
        input.confidence === "low"
          ? input.confidence
          : "low",
      uncertain: Boolean(input.uncertain),
    };

    return NextResponse.json({ data: result });
  } catch (err) {
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/enrich-organization",
      model: CLAUDE_MODEL,
      usage: null,
      latencyMs: Date.now() - startMs,
      status: "error",
    });
    const { status, message } = mapAnthropicError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}
