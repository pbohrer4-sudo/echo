import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/user-context";
import {
  extractBusinessCard,
  type SupportedMediaType,
} from "@/lib/business-card";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { mapAnthropicError } from "@/lib/anthropic-error";
import { logAnthropic } from "@/lib/llm-usage";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024; // Anthropic vision limit
const ACCEPTED: SupportedMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

// Magic-byte signatures for the formats above. file.type comes from
// the browser and is trivially spoofable; Anthropic would reject the
// payload either way, but checking magic bytes here saves a round trip
// and a billable token spend.
function sniffMediaType(buf: Buffer): SupportedMediaType | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "image/png";
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  )
    return "image/gif";
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "image/webp";
  return null;
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit({
    userId: ctx.user_id,
    key: "ai_scan_card",
    ...LIMITS.ai_scan_card,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen — kurz warten." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image required" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Bild zu groß (max. 5MB)" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMediaType(buffer);
  if (!sniffed || !ACCEPTED.includes(sniffed)) {
    return NextResponse.json(
      { error: `Format nicht unterstützt: ${file.type}` },
      { status: 400 },
    );
  }

  const imageBase64 = buffer.toString("base64");
  const supabase = await createClient();
  const startMs = Date.now();
  try {
    const { data, usage, model } = await extractBusinessCard({
      imageBase64,
      mediaType: sniffed,
      apiKey: ctx.claude_key,
    });
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/scan-business-card",
      model,
      usage,
      latencyMs: Date.now() - startMs,
    });
    return NextResponse.json({ data });
  } catch (err) {
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/scan-business-card",
      model: "claude-sonnet-4-6",
      usage: null,
      latencyMs: Date.now() - startMs,
      status: "error",
    });
    const { status, message } = mapAnthropicError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
