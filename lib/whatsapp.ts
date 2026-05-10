import { createAdminClient } from "@/lib/supabase/admin";
import { matchPersonByPhone } from "@/lib/google";
import type { SupabaseScope } from "@/lib/google";

// WhatsApp Cloud API webhook ingestion + send. The webhook receives
// inbound messages addressed to the user's WA Business Number; we
// persist them in wa_messages, match the sender phone to a person,
// and create an interaction row so the message lands on that
// person's timeline alongside meetings and emails.
//
// Setup steps Patrick needs to complete in Meta Business Manager:
//   1. Add a phone number to WA Business
//   2. Configure webhook → URL: <APP_URL>/api/whatsapp/webhook
//      verify_token: env.WHATSAPP_VERIFY_TOKEN
//   3. Subscribe to `messages` and `message_status` fields
//   4. Set env.WHATSAPP_ACCESS_TOKEN (long-lived system user token)
//   5. Set env.WHATSAPP_PHONE_NUMBER_ID (numeric ID from dashboard)
//   6. Insert a service_connections row with provider='whatsapp'
//      and config={ wa_user_id: '<auth.users.id>' } so the webhook
//      knows which Echo user to attribute inbound messages to.

interface WhatsAppPayload {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: WhatsAppChangeValue;
    }>;
  }>;
}

interface WhatsAppChangeValue {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: Array<{
    profile?: { name?: string };
    wa_id?: string;
  }>;
  messages?: Array<{
    id: string;
    from: string;
    timestamp: string; // unix seconds
    type: string;
    text?: { body?: string };
    image?: { id: string; mime_type?: string; caption?: string };
    audio?: { id: string; mime_type?: string };
    document?: { id: string; mime_type?: string; filename?: string };
  }>;
  statuses?: Array<{
    id: string;
    status: string;
    timestamp: string;
    recipient_id: string;
  }>;
}

export interface InboundResult {
  ingested: number;
  matched: number;
  errors: string[];
}

// Resolve which Echo user owns this WA number. We look it up via the
// service_connections table — the row's config.phone_number_id must
// match the webhook's metadata.phone_number_id.
async function resolveOwnerUserId(
  phoneNumberId: string | undefined,
): Promise<string | null> {
  if (!phoneNumberId) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("service_connections")
    .select("user_id, config")
    .eq("provider", "whatsapp")
    .eq("status", "connected")
    .is("deleted_at", null);
  for (const row of data ?? []) {
    const cfg = (row.config as { phone_number_id?: string }) ?? {};
    if (cfg.phone_number_id === phoneNumberId) return row.user_id as string;
  }
  return null;
}

export async function ingestWhatsappPayload(
  body: WhatsAppPayload,
): Promise<InboundResult> {
  const result: InboundResult = { ingested: 0, matched: 0, errors: [] };

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      const userId = await resolveOwnerUserId(phoneNumberId);
      if (!userId) {
        result.errors.push(`no owner for phone_number_id=${phoneNumberId}`);
        continue;
      }
      const ourNumber = value.metadata?.display_phone_number ?? "";
      const supabase = createAdminClient();

      const scope: SupabaseScope = { supabase, userId };

      for (const msg of value.messages ?? []) {
        const personId = await matchPersonByPhone(msg.from, scope);
        if (personId) result.matched += 1;

        const at = new Date(parseInt(msg.timestamp, 10) * 1000).toISOString();
        const text =
          msg.text?.body ??
          msg.image?.caption ??
          (msg.document?.filename ? `[Datei: ${msg.document.filename}]` : null) ??
          (msg.type ? `[${msg.type}]` : null);

        const { data: upserted, error: upsertErr } = await supabase
          .from("wa_messages")
          .upsert(
            {
              user_id: userId,
              external_id: msg.id,
              direction: "in",
              from_number: msg.from,
              to_number: ourNumber,
              message_type: msg.type,
              text_body: text,
              media_url: null,
              media_mime:
                msg.image?.mime_type ??
                msg.audio?.mime_type ??
                msg.document?.mime_type ??
                null,
              message_at: at,
              status: "delivered",
              raw: msg as unknown as Record<string, unknown>,
              matched_person_id: personId,
              unread: true,
            },
            { onConflict: "user_id,external_id" },
          )
          .select("id, interaction_id")
          .maybeSingle();
        if (upsertErr) {
          result.errors.push(upsertErr.message);
          continue;
        }
        result.ingested += 1;

        if (upserted && !upserted.interaction_id && personId) {
          const { data: ins } = await supabase
            .from("interactions")
            .insert({
              user_id: userId,
              person_id: personId,
              type: "voice", // WA voice notes / chat both squeeze into 'voice' bucket since schema is fixed
              source: "calendar",
              occurred_at: at,
              summary: text?.slice(0, 200) ?? "WhatsApp",
            })
            .select("id")
            .maybeSingle();
          if (ins?.id) {
            await supabase
              .from("wa_messages")
              .update({ interaction_id: ins.id })
              .eq("id", upserted.id);
          }
        }
      }

      for (const status of value.statuses ?? []) {
        await supabase
          .from("wa_messages")
          .update({ status: status.status })
          .eq("external_id", status.id);
      }
    }
  }

  return result;
}

// Send an outbound text message via Cloud API. Used by future "reply
// from Echo" flows.
export async function sendWhatsappText({
  toNumber,
  body,
}: {
  toNumber: string;
  body: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    return {
      ok: false,
      error: "WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing",
    };
  }
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toNumber,
        type: "text",
        text: { body },
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `WA send ${res.status}: ${text.slice(0, 200)}` };
  }
  const data = (await res.json()) as { messages?: Array<{ id: string }> };
  return { ok: true, id: data.messages?.[0]?.id };
}
