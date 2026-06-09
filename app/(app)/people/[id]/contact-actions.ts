"use server";

// Server-Actions für Kontakt-Quickadd auf der Person-Detail-Page.
// Schreibt direkt in person_contacts (V3-Schema, 0030). is_primary
// wird automatisch true gesetzt wenn es der erste Eintrag in dem
// Channel ist.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  CONTACT_CHANNELS,
  type AddressEntry,
  type ContactChannel,
} from "@/lib/types";

export async function addContactAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const personId = String(formData.get("person_id") ?? "").trim();
  const channelRaw = String(formData.get("channel") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  const subtype = String(formData.get("subtype") ?? "").trim() || null;

  if (!personId) return { ok: false, error: "person_id fehlt" };
  if (!value) return { ok: false, error: "Wert fehlt" };
  if (!(CONTACT_CHANNELS as readonly string[]).includes(channelRaw)) {
    return { ok: false, error: "Ungültiger Channel" };
  }
  const channel = channelRaw as ContactChannel;

  // is_primary: erster Eintrag pro (person, channel) wird primary.
  const { count } = await supabase
    .from("person_contacts")
    .select("id", { count: "exact", head: true })
    .eq("person_id", personId)
    .eq("channel", channel);

  const isPrimary = (count ?? 0) === 0;

  const { error } = await supabase.from("person_contacts").insert({
    user_id: user.id,
    person_id: personId,
    channel,
    subtype,
    value,
    is_primary: isPrimary,
    source: "manual",
  });

  if (error) {
    console.error("[contact-actions] addContact failed", error);
    return { ok: false, error: error.message };
  }

  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

// Update value (und optional subtype) eines bestehenden Kontakts.
// Verwendet vom inline-Edit auf der ActionBar: Klick auf die
// existierende Nummer → kleines Popover mit pre-filled value.
export async function updateContactAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const contactId = String(formData.get("contact_id") ?? "").trim();
  const personId = String(formData.get("person_id") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  const subtypeRaw = String(formData.get("subtype") ?? "");
  const subtype = subtypeRaw.trim() || null;

  if (!contactId || !personId)
    return { ok: false, error: "contact_id/person_id fehlt" };
  if (!value) return { ok: false, error: "Wert fehlt" };

  const update: Record<string, unknown> = { value };
  // Nur überschreiben wenn der Caller subtype mitgibt — leerer
  // String würde sonst einen existierenden Label-Subtyp killen.
  if (subtypeRaw.length > 0) update.subtype = subtype;

  const { error } = await supabase
    .from("person_contacts")
    .update(update)
    .eq("id", contactId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

// Inline-Quickadd der Stammdaten-Adresse: nimmt eine einzeilige
// Eingabe („Straße 1, 93047 Regensburg, Deutschland") und hängt sie
// als neuen Eintrag an people.addresses (JSONB-Array). Leichtes
// Parsing auf Kommata — die strukturierte Bearbeitung bleibt im
// Edit-Formular. Kein addContactAction, weil Adressen kein
// person_contacts-Channel sind.
function parseAddressLine(raw: string): AddressEntry {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const entry: AddressEntry = {
    label: "andere",
    street: null,
    city: null,
    postal_code: null,
    country: null,
  };
  if (parts.length >= 1) entry.street = parts[0];
  if (parts.length >= 2) {
    // Mittelteil als „PLZ Ort" interpretieren wenn er mit Ziffern beginnt.
    const m = parts[1].match(/^(\d{4,5})\s+(.+)$/);
    if (m) {
      entry.postal_code = m[1];
      entry.city = m[2];
    } else {
      entry.city = parts[1];
    }
  }
  if (parts.length >= 3) entry.country = parts[parts.length - 1];
  return entry;
}

export async function addAddressAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const personId = String(formData.get("person_id") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  if (!personId) return { ok: false, error: "person_id fehlt" };
  if (!value) return { ok: false, error: "Wert fehlt" };

  const { data: row, error: fetchErr } = await supabase
    .from("people")
    .select("addresses, updated_at")
    .eq("id", personId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchErr || !row) return { ok: false, error: "Person nicht gefunden" };

  const updatedAt = row.updated_at as string;
  const existing = (row.addresses ?? []) as AddressEntry[];
  const next = [...existing, parseAddressLine(value)];

  const { error, count } = await supabase
    .from("people")
    .update({ addresses: next }, { count: "exact" })
    .eq("id", personId)
    .eq("user_id", user.id)
    .eq("updated_at", updatedAt);
  if (error) {
    console.error("[contact-actions] addAddress failed", error);
    return { ok: false, error: error.message };
  }
  if (count === 0) return { ok: false, error: "Konflikt - bitte neu laden" };

  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

export async function deleteContactAction(
  contactId: string,
  personId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const { error } = await supabase
    .from("person_contacts")
    .delete()
    .eq("id", contactId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

export async function setPrimaryContactAction(
  contactId: string,
  personId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  // Welcher Channel? Brauchen wir um andere primary derselben
  // (person, channel) auf false zu setzen.
  const { data: target, error: fetchErr } = await supabase
    .from("person_contacts")
    .select("channel")
    .eq("id", contactId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchErr || !target) return { ok: false, error: "nicht gefunden" };

  // Andere primary derselben Person+Channel auf false.
  await supabase
    .from("person_contacts")
    .update({ is_primary: false })
    .eq("person_id", personId)
    .eq("channel", target.channel as ContactChannel)
    .eq("user_id", user.id)
    .neq("id", contactId);

  const { error } = await supabase
    .from("person_contacts")
    .update({ is_primary: true })
    .eq("id", contactId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/people/${personId}`);
  return { ok: true };
}
