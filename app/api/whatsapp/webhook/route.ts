import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ingestWhatsappPayload } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 30;

// Meta's webhook contract:
//
// GET  /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y
//        → reply with the challenge string when verify_token matches
//          env.WHATSAPP_VERIFY_TOKEN
//
// POST /api/whatsapp/webhook
//        → JSON payload with `entry[].changes[].value.messages[]`
//        → header X-Hub-Signature-256 = HMAC-SHA256(body, app_secret)
//        → respond 200 within 5s or Meta retries
//
// The signature check uses env.WHATSAPP_APP_SECRET. Skip the check
// only in dev when both env vars are absent — useful for local
// curl testing, but production MUST set it.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "WHATSAPP_VERIFY_TOKEN not configured" },
      { status: 500 },
    );
  }

  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const sigHeader = request.headers.get("x-hub-signature-256") ?? "";
    const expected =
      "sha256=" +
      createHmac("sha256", appSecret).update(rawBody).digest("hex");
    if (!safeEqual(sigHeader, expected)) {
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Production must have a signature check. Refuse to silently
    // accept payloads in prod without secret configured.
    return NextResponse.json(
      { error: "WHATSAPP_APP_SECRET not configured" },
      { status: 500 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Always 200 quickly so Meta doesn't retry. Errors are logged
  // server-side; per Cloud API docs we should swallow processing
  // errors at the wire level.
  ingestWhatsappPayload(payload as Parameters<typeof ingestWhatsappPayload>[0])
    .then((result) => {
      if (result.errors.length > 0) {
        console.warn("[wa-webhook] ingestion errors", result.errors);
      }
    })
    .catch((err) => {
      console.error("[wa-webhook] ingestion failed", err);
    });

  return NextResponse.json({ ok: true });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
