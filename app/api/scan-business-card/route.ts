import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/user-context";
import {
  extractBusinessCard,
  type SupportedMediaType,
} from "@/lib/business-card";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024; // Anthropic vision limit
const ACCEPTED: SupportedMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  const mediaType = file.type as SupportedMediaType;
  if (!ACCEPTED.includes(mediaType)) {
    return NextResponse.json(
      { error: `Format nicht unterstützt: ${file.type}` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const imageBase64 = buffer.toString("base64");

  try {
    const data = await extractBusinessCard({
      imageBase64,
      mediaType,
      apiKey: ctx.claude_key,
    });
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
