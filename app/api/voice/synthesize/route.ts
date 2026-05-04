import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { synthesizeSpeech } from "@/lib/elevenlabs";

export const runtime = "nodejs";

interface SynthesizeBody {
  text: string;
  voice_id?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  try {
    const audio = await synthesizeSpeech({
      text,
      voiceId: body.voice_id,
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
