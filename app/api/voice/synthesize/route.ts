import { NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/elevenlabs";
import { getUserContext } from "@/lib/user-context";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

interface SynthesizeBody {
  text: string;
  voice_id?: string;
}

// ElevenLabs charges per character. Cap input so a runaway prompt
// can't bill thousands of characters in a single request.
const MAX_CHARS = 2000;

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit({
    userId: ctx.user_id,
    key: "ai_synthesize",
    ...LIMITS.ai_synthesize,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen — kurz warten." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: SynthesizeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `Text zu lang (max ${MAX_CHARS} Zeichen)` },
      { status: 413 },
    );
  }

  try {
    const audio = await synthesizeSpeech({
      text,
      voiceId: body.voice_id ?? ctx.voice_id ?? undefined,
      apiKey: ctx.elevenlabs_key,
    });
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "tts failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
