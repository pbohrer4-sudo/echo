// Helper-Funktionen für person_contacts (V3-Schema, Migration 0030).
//
// Phase 1: Reads existieren, Writes auch — aber UI nutzt sie noch
// nicht. In Phase 2 ziehen Person-Detail / ChannelsList / ActionBar
// auf diese Lib um, danach werden die JSONB-Spalten gedroppt.

import { createClient } from "@/lib/supabase/server";
import type {
  ContactChannel,
  ContactSource,
  PersonContact,
} from "@/lib/types";

export interface CreateContactInput {
  person_id: string;
  channel: ContactChannel;
  value: string;
  subtype?: string | null;
  country_code?: string | null;
  is_primary?: boolean;
  source?: ContactSource;
}

export async function listContactsForPerson(
  personId: string,
): Promise<PersonContact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_contacts")
    .select("*")
    .eq("person_id", personId)
    .order("channel", { ascending: true })
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[contacts] list failed", error);
    return [];
  }
  return (data ?? []) as PersonContact[];
}

// Lookup: hat irgendeine Person diesen Kanal-Wert? Für Voice-Dedupe
// + Cross-Person-Suche („+49 173..." → Sarah).
export async function findContactByValue(
  channel: ContactChannel,
  value: string,
): Promise<PersonContact | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("person_contacts")
    .select("*")
    .eq("user_id", user.id)
    .eq("channel", channel)
    .ilike("value", value)
    .maybeSingle();
  if (error) {
    console.error("[contacts] findByValue failed", error);
    return null;
  }
  return data as PersonContact | null;
}

export async function createContact(
  input: CreateContactInput,
): Promise<PersonContact | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // is_primary-Logik: wenn das hier primary werden soll, vorher alle
  // anderen primary derselben Person+Channel auf false setzen.
  if (input.is_primary) {
    await supabase
      .from("person_contacts")
      .update({ is_primary: false })
      .eq("person_id", input.person_id)
      .eq("channel", input.channel);
  }

  const { data, error } = await supabase
    .from("person_contacts")
    .insert({
      user_id: user.id,
      person_id: input.person_id,
      channel: input.channel,
      value: input.value.trim(),
      subtype: input.subtype ?? null,
      country_code: input.country_code ?? null,
      is_primary: input.is_primary ?? false,
      source: input.source ?? "manual",
    })
    .select("*")
    .single();
  if (error) {
    console.error("[contacts] create failed", error);
    return null;
  }
  return data as PersonContact;
}

export async function updateContact(
  id: string,
  patch: Partial<Pick<PersonContact, "value" | "subtype" | "country_code" | "is_primary">>,
): Promise<boolean> {
  const supabase = await createClient();
  // is_primary toggle: wenn auf true, andere derselben Person+Channel
  // erst auf false setzen.
  if (patch.is_primary === true) {
    const { data: current } = await supabase
      .from("person_contacts")
      .select("person_id, channel")
      .eq("id", id)
      .maybeSingle();
    if (current) {
      await supabase
        .from("person_contacts")
        .update({ is_primary: false })
        .eq("person_id", current.person_id)
        .eq("channel", current.channel)
        .neq("id", id);
    }
  }
  const { error } = await supabase
    .from("person_contacts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[contacts] update failed", error);
    return false;
  }
  return true;
}

export async function deleteContact(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("person_contacts").delete().eq("id", id);
  if (error) {
    console.error("[contacts] delete failed", error);
    return false;
  }
  return true;
}

// Get primary contact for a given channel — wird in der ActionBar
// genutzt um z. B. die default-Nummer für „Anrufen" zu finden.
export function findPrimaryByChannel(
  contacts: PersonContact[],
  channel: ContactChannel,
): PersonContact | null {
  const inChannel = contacts.filter((c) => c.channel === channel);
  if (inChannel.length === 0) return null;
  return inChannel.find((c) => c.is_primary) ?? inChannel[0];
}
