import { NextResponse } from "next/server";
import sharp from "sharp";
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

const MAX_BYTES = 10 * 1024 * 1024; // sharp converts HEIC/TIFF/etc — raw can be bigger than the JPEG we send up.

// PDF magic: "%PDF".
function isPdf(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46
  );
}

// Map sharp's format strings → Anthropic media types. Anything not in
// this map (heif/heic/avif/tiff/raw/svg/…) gets re-encoded as JPEG.
const SHARP_TO_MEDIA: Record<string, SupportedMediaType | undefined> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

interface PreparedMedia {
  base64: string;
  mediaType: SupportedMediaType | "application/pdf";
}

// Akzeptiert alles was sharp lesen kann (HEIC, HEIF, AVIF, TIFF, …) und
// konvertiert nach JPEG wenn das Format nicht direkt von Anthropic
// unterstützt wird. PDFs werden unverändert durchgereicht — der Caller
// schickt sie als document-content statt image-content.
async function prepareMedia(buf: Buffer): Promise<PreparedMedia | null> {
  if (isPdf(buf)) {
    return { base64: buf.toString("base64"), mediaType: "application/pdf" };
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buf).metadata();
  } catch {
    return null;
  }

  const direct = metadata.format ? SHARP_TO_MEDIA[metadata.format] : undefined;
  if (direct) {
    return { base64: buf.toString("base64"), mediaType: direct };
  }

  // Fremdformat (HEIC, AVIF, TIFF, …) — nach JPEG re-encoden. EXIF wird
  // entfernt damit Orientation korrekt gerendert wird; rotate() ohne
  // Argument wendet die Orientation auf die Pixel an.
  try {
    const jpeg = await sharp(buf)
      .rotate()
      .jpeg({ quality: 88 })
      .toBuffer();
    return { base64: jpeg.toString("base64"), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
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
      { error: "Datei zu groß (max. 10MB)" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const prepared = await prepareMedia(buffer);
  if (!prepared) {
    return NextResponse.json(
      {
        error: `Format nicht erkannt (${file.type || "unbekannt"}) — unterstützt: JPG, PNG, WebP, GIF, HEIC, HEIF, AVIF, TIFF, PDF`,
      },
      { status: 400 },
    );
  }
  const supabase = await createClient();
  const startMs = Date.now();
  try {
    const { data, usage, model } = await extractBusinessCard({
      imageBase64: prepared.base64,
      mediaType: prepared.mediaType,
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
