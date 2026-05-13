import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CLAUDE_MODEL, chatWithTools, type ChatMessage } from "@/lib/claude";
import { buildExtractionSystemPrompt } from "@/lib/prompts";
import { EXTRACTION_TOOLS } from "@/lib/tools";
import { getUserContext } from "@/lib/user-context";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { mapAnthropicError } from "@/lib/anthropic-error";
import { logAnthropic } from "@/lib/llm-usage";

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
  const { data: peopleData, error: peopleError } = await supabase
    .from("people")
    .select("id, name, company")
    .is("deleted_at", null)
    .eq("is_self", false)
    .order("last_contact_at", { ascending: false, nullsFirst: false })
    .limit(PEOPLE_PROMPT_LIMIT);

  if (peopleError) {
    return NextResponse.json(
      { error: `people fetch: ${peopleError.message}` },
      { status: 500 },
    );
  }

  const system = buildExtractionSystemPrompt({
    displayName: ctx.display_name,
    people: peopleData ?? [],
    now: new Date(),
  });

  const messages: ChatMessage[] = [
    ...(body.history ?? []),
    { role: "user", content: transcript },
  ];

  const startMs = Date.now();
  try {
    const { text, toolCalls, usage } = await chatWithTools({
      messages,
      system,
      tools: EXTRACTION_TOOLS,
      apiKey: ctx.claude_key,
    });
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/extract",
      model: CLAUDE_MODEL,
      usage,
      latencyMs: Date.now() - startMs,
    });

    const peopleMap = new Map<string, string>(
      (peopleData ?? []).map((p) => [p.id as string, p.name as string]),
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
