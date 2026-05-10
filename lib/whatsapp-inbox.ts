import { createClient } from "@/lib/supabase/server";

export interface WhatsappInboxRow {
  id: string;
  external_id: string;
  from_number: string;
  text_body: string | null;
  message_at: string;
  message_type: string;
  matched_person_id: string | null;
  matched_person_name: string | null;
  unread: boolean;
}

export async function listUnreadWhatsapp(): Promise<WhatsappInboxRow[]> {
  const supabase = await createClient();
  const { data: msgs, error } = await supabase
    .from("wa_messages")
    .select("id, external_id, from_number, text_body, message_at, message_type, matched_person_id, unread")
    .eq("direction", "in")
    .eq("unread", true)
    .order("message_at", { ascending: false })
    .limit(20);
  if (error) return [];
  if (!msgs?.length) return [];

  const personIds = Array.from(
    new Set(
      msgs
        .map((m) => m.matched_person_id)
        .filter((id): id is string => !!id),
    ),
  );
  const nameById = new Map<string, string>();
  if (personIds.length > 0) {
    const { data: people } = await supabase
      .from("people")
      .select("id, name")
      .in("id", personIds);
    for (const p of people ?? []) nameById.set(p.id, p.name);
  }

  return msgs.map((m) => ({
    id: m.id,
    external_id: m.external_id,
    from_number: m.from_number,
    text_body: m.text_body,
    message_at: m.message_at,
    message_type: m.message_type,
    matched_person_id: m.matched_person_id,
    matched_person_name: m.matched_person_id
      ? (nameById.get(m.matched_person_id) ?? null)
      : null,
    unread: m.unread,
  }));
}

export async function markWhatsappRead(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("wa_messages").update({ unread: false }).eq("id", id);
}
