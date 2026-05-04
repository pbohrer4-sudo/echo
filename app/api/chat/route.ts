import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chat, type ChatMessage } from "@/lib/claude";
import { buildVoiceSystemPrompt } from "@/lib/prompts";

export const runtime = "nodejs";

interface ChatRequestBody {
  messages: ChatMessage[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
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

  const displayName =
    user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "Patrick";

  try {
    const text = await chat({
      messages: body.messages,
      system: buildVoiceSystemPrompt(displayName),
    });
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "claude failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
