import { NextResponse } from "next/server";
import { CLAUDE_MODEL, chat, type ChatMessage } from "@/lib/claude";
import { buildVoiceSystemPrompt, type PersonContext } from "@/lib/prompts";
import { getUserContext } from "@/lib/user-context";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { mapAnthropicError } from "@/lib/anthropic-error";
import { logAnthropic } from "@/lib/llm-usage";

export const runtime = "nodejs";

// Wieviele Personen wir Claude pro Chat-Turn mitgeben. Sortiert nach
// last_contact_at-DESC damit aktuelle Kontakte priorisiert werden —
// alte Bekannte landen außen vor wenn der CRM wächst.
const PEOPLE_CONTEXT_LIMIT = 60;

interface ChatRequestBody {
  messages: ChatMessage[];
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit({
    userId: ctx.user_id,
    key: "ai_chat",
    ...LIMITS.ai_chat,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen — kurz warten." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Personen-Kontext für den System-Prompt. Ohne das hier weiß der LLM
  // NICHTS über die Leute in Patricks CRM — Fragen wie „suche Geschenk
  // für Hannes" landeten am 14. Mai in einem „keine Geschenkidee
  // hinterlegt" obwohl Hannes' gift_idea voll war. Wir laden die
  // wichtigsten Skalare (gift_idea / notes / how_we_met) damit der LLM
  // direkt antworten kann statt zu raten.
  const { data: peopleData } = await supabase
    .from("people")
    .select("id, name, company, role, gift_idea, notes, how_we_met")
    .is("deleted_at", null)
    .eq("is_self", false)
    .order("last_contact_at", { ascending: false, nullsFirst: false })
    .limit(PEOPLE_CONTEXT_LIMIT);
  const people = (peopleData ?? []) as PersonContext[];

  const startMs = Date.now();
  try {
    const { text, usage } = await chat({
      messages: body.messages,
      system: buildVoiceSystemPrompt({ displayName: ctx.display_name, people }),
      apiKey: ctx.claude_key,
    });
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/chat",
      model: CLAUDE_MODEL,
      usage,
      latencyMs: Date.now() - startMs,
    });
    return NextResponse.json({ text });
  } catch (err) {
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/chat",
      model: CLAUDE_MODEL,
      usage: null,
      latencyMs: Date.now() - startMs,
      status: "error",
    });
    const { status, message } = mapAnthropicError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
