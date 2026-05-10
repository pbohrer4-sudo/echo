import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/user-context";
import { sendWhatsappText } from "@/lib/whatsapp";
import { matchPersonByPhone } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 30;

interface SendBody {
  to_number: string;
  body: string;
  person_id?: string | null;
  // Optional: id of an inbound wa_messages row this is replying to.
  // We mark that row as read in the same transaction so the reply
  // flow doubles as dismissal.
  reply_to_id?: string | null;
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const text = (body.body ?? "").trim();
  const to = (body.to_number ?? "").trim();
  if (!text || !to) {
    return NextResponse.json(
      { error: "to_number and body required" },
      { status: 400 },
    );
  }

  const sendResult = await sendWhatsappText({ toNumber: to, body: text });
  if (!sendResult.ok) {
    return NextResponse.json(
      { error: sendResult.error ?? "send failed" },
      { status: 502 },
    );
  }

  const supabase = await createClient();
  const at = new Date().toISOString();

  // Resolve person if not passed in. Outbound messages should still
  // land on the right timeline.
  const personId =
    body.person_id ?? (await matchPersonByPhone(to)) ?? null;

  // Persist the outbound copy. external_id from Meta lets future
  // status webhooks (sent/delivered/read) update the same row.
  const { data: inserted, error: insertErr } = await supabase
    .from("wa_messages")
    .insert({
      user_id: ctx.user_id,
      external_id: sendResult.id ?? `local-${Date.now()}`,
      direction: "out",
      from_number: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "self",
      to_number: to,
      message_type: "text",
      text_body: text,
      message_at: at,
      status: "sent",
      raw: null,
      matched_person_id: personId,
      unread: false,
    })
    .select("id")
    .maybeSingle();
  if (insertErr) {
    // Send already happened — log but don't fail the response.
    console.error("[wa-send] persist failed", insertErr.message);
  }

  // Optional: drop an interaction row so the timeline shows the WA
  // exchange even if the user never opens the inbox.
  if (personId) {
    const { data: ins } = await supabase
      .from("interactions")
      .insert({
        user_id: ctx.user_id,
        person_id: personId,
        type: "voice", // schema-allowed bucket — WA squeezes in here for now
        source: "manual",
        occurred_at: at,
        summary: `WhatsApp → ${text.slice(0, 200)}`,
      })
      .select("id")
      .maybeSingle();
    if (ins?.id && inserted?.id) {
      await supabase
        .from("wa_messages")
        .update({ interaction_id: ins.id })
        .eq("id", inserted.id);
    }
  }

  // Mark the inbound message read in the same call so the inbox
  // collapses cleanly after a reply.
  if (body.reply_to_id) {
    await supabase
      .from("wa_messages")
      .update({ unread: false })
      .eq("id", body.reply_to_id);
  }

  revalidatePath("/inbox");
  if (personId) revalidatePath(`/people/${personId}`);

  return NextResponse.json({ ok: true, id: sendResult.id });
}
