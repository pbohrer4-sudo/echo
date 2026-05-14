import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CLAUDE_MODEL,
  chatToolResultFollowup,
  chatWithTools,
  type ChatMessage,
} from "@/lib/claude";
import { buildExtractionSystemPrompt } from "@/lib/prompts";
import {
  loadOrganizationsContext,
  loadPeopleContext,
} from "@/lib/llm-people-context";
import { EXTRACTION_TOOLS } from "@/lib/tools";
import { getUserContext } from "@/lib/user-context";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { mapAnthropicError } from "@/lib/anthropic-error";
import { logAnthropic } from "@/lib/llm-usage";
import { executeQueryPeople } from "@/lib/people-query";
import type { PeopleFilterSpec } from "@/lib/people-filter";

export const runtime = "nodejs";

interface ExtractRequest {
  transcript: string;
  history?: ChatMessage[];
}

// Cap on how many people we send into the system prompt as the
// name→id map. Beyond a few hundred contacts the prompt balloons and
// PII surface to the LLM grows unnecessarily — Claude can ask the
// user to disambiguate by name in the rare case the cap matters.
const PEOPLE_PROMPT_LIMIT = 500;
const ORGS_PROMPT_LIMIT = 200;

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit({
    userId: ctx.user_id,
    key: "ai_extract",
    ...LIMITS.ai_extract,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen — kurz warten." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: ExtractRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const transcript = body.transcript?.trim();
  if (!transcript) {
    return NextResponse.json({ error: "transcript required" }, { status: 400 });
  }

  const supabase = await createClient();
  // Rich-Context: people-Skalare + tags + passions + contacts +
  // relationships + life_events + geographies + organisationen.
  // Verhindert „nichts hinterlegt"-Halluzinationen wenn der User nach
  // Daten fragt die im CRM stehen.
  const [people, organizations] = await Promise.all([
    loadPeopleContext(supabase, PEOPLE_PROMPT_LIMIT),
    loadOrganizationsContext(supabase, ORGS_PROMPT_LIMIT),
  ]);

  const system = buildExtractionSystemPrompt({
    displayName: ctx.display_name,
    people,
    organizations,
    now: new Date(),
  });

  const messages: ChatMessage[] = [
    ...(body.history ?? []),
    { role: "user", content: transcript },
  ];

  const startMs = Date.now();
  try {
    const initial = await chatWithTools({
      messages,
      system,
      tools: EXTRACTION_TOOLS,
      apiKey: ctx.claude_key,
    });
    let { text, toolCalls } = initial;
    const { rawContent, usage } = initial;
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/extract",
      model: CLAUDE_MODEL,
      usage,
      latencyMs: Date.now() - startMs,
    });

    // 0028-Voice-Roundtrip: wenn query_people aufgerufen wurde, führe die
    // Query server-side aus und gib Claude die Zahlen via tool_result
    // zurück damit es eine konkrete spoken-Antwort formulieren kann
    // („47 in München, darunter Mara und Tobias.").
    const queryCalls = toolCalls.filter((c) => c.name === "query_people");
    if (queryCalls.length > 0) {
      const results = await Promise.all(
        queryCalls.map(async (c) => {
          const spec = c.input as PeopleFilterSpec;
          const res = await executeQueryPeople(spec);
          return {
            tool_use_id: c.id,
            content: JSON.stringify({
              count: res.count,
              sample_names: res.sample,
              total_people: res.total_people,
              filter_summary: res.filter_summary,
              instruction:
                "Antworte in EINEM kurzen deutschen Satz mit Zahl + bis zu 2-3 Sample-Namen. Beispiel: '47 Personen in München, darunter Mara und Tobias.' Wenn count=0: 'Keine Treffer für [filter_summary].'",
            }),
          };
        }),
      );
      const followupStart = Date.now();
      const followup = await chatToolResultFollowup({
        messages,
        system,
        assistantContent: rawContent,
        toolResults: results,
        tools: EXTRACTION_TOOLS,
        apiKey: ctx.claude_key,
      });
      void logAnthropic({
        supabase,
        userId: ctx.user_id,
        endpoint: "/api/extract:followup",
        model: CLAUDE_MODEL,
        usage: followup.usage,
        latencyMs: Date.now() - followupStart,
      });
      text = followup.text || text;
    }

    const peopleMap = new Map<string, string>(
      people.map((p) => [p.id, p.name]),
    );
    const enrichedCalls = toolCalls.map((c) => {
      if (c.name !== "update_person") return c;
      const id = (c.input as { id?: unknown }).id;
      if (typeof id !== "string") return c;
      const name = peopleMap.get(id);
      if (!name) return c;
      return {
        ...c,
        input: { ...c.input, _person_name: name },
      };
    });

    return NextResponse.json({ text, toolCalls: enrichedCalls });
  } catch (err) {
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/extract",
      model: CLAUDE_MODEL,
      usage: null,
      latencyMs: Date.now() - startMs,
      status: "error",
    });
    const { status, message } = mapAnthropicError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
