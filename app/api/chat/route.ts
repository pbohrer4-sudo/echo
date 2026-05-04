import { NextResponse } from "next/server";
import { chat, type ChatMessage } from "@/lib/claude";
import { buildVoiceSystemPrompt } from "@/lib/prompts";
import { getUserContext } from "@/lib/user-context";

export const runtime = "nodejs";

interface ChatRequestBody {
  messages: ChatMessage[];
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  try {
    const text = await chat({
      messages: body.messages,
      system: buildVoiceSystemPrompt(ctx.display_name),
      apiKey: ctx.claude_key,
    });
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "claude failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
