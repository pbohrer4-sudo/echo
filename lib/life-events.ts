// Life-Events CRUD-Helper (Phase D2, Briefing v3 Section 11).
//
// File-Upload geht über Supabase Storage Bucket "life-events".
// Pfad-Convention: {user_id}/{life_event_id}/{filename}.
// Bucket muss separat im Supabase Dashboard angelegt werden mit
// privatem Zugriff + RLS-Policy auf den objects-Table.

import { createClient } from "@/lib/supabase/server";
import type { LifeEventRow, LifeEventType, Person } from "@/lib/types";

export const LIFE_EVENTS_BUCKET = "life-events";

interface CreateInput {
  title: string;
  description?: string | null;
  event_type: LifeEventType;
  occurred_at: string; // ISO
  file_path?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  thumbnail_path?: string | null;
  location_name?: string | null;
  google_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  person_ids?: string[];
}

export async function createLifeEvent(
  input: CreateInput,
): Promise<LifeEventRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: event, error: insertErr } = await supabase
    .from("life_events")
    .insert({
      user_id: user.id,
      title: input.title.trim(),
      description: input.description ?? null,
      event_type: input.event_type,
      occurred_at: input.occurred_at,
      file_path: input.file_path ?? null,
      file_size_bytes: input.file_size_bytes ?? null,
      mime_type: input.mime_type ?? null,
      thumbnail_path: input.thumbnail_path ?? null,
      location_name: input.location_name ?? null,
      google_place_id: input.google_place_id ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .select("*")
    .single();

  if (insertErr || !event) {
    console.error("[life-events] insert failed", insertErr);
    return null;
  }

  // Verknüpfen mit Personen (Multi-Person, Junction-Tabelle)
  if (input.person_ids && input.person_ids.length > 0) {
    const links = input.person_ids.map((pid) => ({
      person_id: pid,
      life_event_id: event.id,
    }));
    const { error: linkErr } = await supabase
      .from("person_life_events")
      .insert(links);
    if (linkErr) {
      console.error("[life-events] linking failed", linkErr);
      // Event existiert trotzdem — Linking ist nice-to-have
    }
  }

  return event as LifeEventRow;
}

export async function listLifeEventsForPerson(
  personId: string,
): Promise<LifeEventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_life_events")
    .select("life_events(*)")
    .eq("person_id", personId);
  if (error) {
    console.error("[life-events] listForPerson failed", error);
    return [];
  }
  const rows = (data ?? []) as unknown as {
    life_events: LifeEventRow | null;
  }[];
  return rows
    .map((r) => r.life_events)
    .filter((e): e is LifeEventRow => e !== null && e.deleted_at === null)
    .sort((a, b) =>
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    );
}

export async function listAllLifeEvents(): Promise<
  Array<{ event: LifeEventRow; persons: Person[] }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: events, error: evErr } = await supabase
    .from("life_events")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false });
  if (evErr) {
    console.error("[life-events] listAll failed", evErr);
    return [];
  }
  if (!events || events.length === 0) return [];

  const eventIds = events.map((e) => e.id);
  const { data: links } = await supabase
    .from("person_life_events")
    .select("life_event_id, people(*)")
    .in("life_event_id", eventIds);

  // Index event_id → persons[]
  const linkMap = new Map<string, Person[]>();
  for (const row of (links ?? []) as unknown as {
    life_event_id: string;
    people: Person | null;
  }[]) {
    if (!row.people) continue;
    if (!linkMap.has(row.life_event_id)) {
      linkMap.set(row.life_event_id, []);
    }
    linkMap.get(row.life_event_id)!.push(row.people);
  }

  return (events as LifeEventRow[]).map((ev) => ({
    event: ev,
    persons: linkMap.get(ev.id) ?? [],
  }));
}

export async function deleteLifeEvent(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("life_events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[life-events] delete failed", error);
    return false;
  }
  return true;
}

/**
 * Liefert eine signed-URL für ein Life-Event-File. 1h gültig.
 * Wenn file_path null ist (z.B. milestone/note), wird null zurückgegeben.
 */
export async function getSignedFileUrl(
  filePath: string | null,
): Promise<string | null> {
  if (!filePath) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(LIFE_EVENTS_BUCKET)
    .createSignedUrl(filePath, 60 * 60);
  if (error) {
    console.error("[life-events] sign url failed", error);
    return null;
  }
  return data?.signedUrl ?? null;
}
