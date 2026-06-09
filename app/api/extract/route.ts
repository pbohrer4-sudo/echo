import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { type ChatMessage } from "@/lib/claude";
import { runExtraction } from "@/lib/extract-run";
import { getUserContext } from "@/lib/user-context";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { mapAnthropicError } from "@/lib/anthropic-error";

export const runtime = "nodejs";

interface ExtractRequest {
  transcript: string;
  history?: ChatMessage[];
}

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
  try {
    const result = await runExtraction({
      supabase,
      userId: ctx.user_id,
      displayName: ctx.display_name,
      claudeKey: ctx.claude_key,
      transcript,
      history: body.history,
      endpoint: "/api/extract",
    });
    return NextResponse.json(result);
  } catch (err) {
    const { status, message } = mapAnthropicError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
