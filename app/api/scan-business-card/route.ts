import { NextResponse } from "next/server";
import sharp from "sharp";
import { getUserContext } from "@/lib/user-context";
import {
  extractBusinessCard,
  type SupportedMediaType,
} from "@/lib/business-card";
import { MISTRAL_OCR_MODEL } from "@/lib/mistral-ocr";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { logMistralOcr } from "@/lib/llm-usage";

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

// Map sharp's format strings → Mistral-OCR-kompatible media types.
// Mistral akzeptiert image/jpeg, image/png, image/webp, image/gif
// nativ — alles andere (HEIC, AVIF, TIFF, …) wird vorab nach JPEG
// re-encoded.
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

  // Fremdformat (HEIC, AVIF, TIFF, …) → JPEG. rotate() ohne Argument
  // wendet die EXIF-Orientation auf die Pixel an damit OCR die Karte
  // korrekt herum sieht.
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

  // BYO Mistral-Key aus Profil; fällt automatisch auf MISTRAL_API_KEY
  // (Server-Env) zurück wenn der User keinen eigenen hinterlegt hat.
  const mistralKey = ctx.byo_keys.mistral ?? null;

  const supabase = await createClient();
  const startMs = Date.now();
  try {
    const { data, usage, model } = await extractBusinessCard({
      imageBase64: prepared.base64,
      mediaType: prepared.mediaType,
      apiKey: mistralKey,
    });
    void logMistralOcr({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/scan-business-card",
      model,
      pagesProcessed: usage.pages_processed,
      latencyMs: Date.now() - startMs,
    });
    return NextResponse.json({ data });
  } catch (err) {
    void logMistralOcr({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/scan-business-card",
      model: MISTRAL_OCR_MODEL,
      pagesProcessed: 0,
      latencyMs: Date.now() - startMs,
      status: "error",
    });
    const message =
      err instanceof Error
        ? err.message
        : "Mistral OCR fehlgeschlagen";
    // Mistral 401/403/429 sollen als 4xx zum Client durchgereicht
    // werden damit das UI vernünftig reagieren kann; alle anderen
    // Mistral-Fehler werden zu 502.
    const lower = message.toLowerCase();
    let status = 502;
    if (lower.includes("401") || lower.includes("unauthorized")) status = 401;
    else if (lower.includes("403")) status = 403;
    else if (lower.includes("429")) status = 429;
    else if (lower.includes("mistral_api_key")) status = 500;
    return NextResponse.json({ error: message }, { status });
  }
}
