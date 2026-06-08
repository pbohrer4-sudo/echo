"use server";

// Server Actions für Life Events auf Person-Detail (Phase D2,
// Briefing v3 §11).

import { revalidatePath } from "next/cache";
import {
  createLifeEvent,
  deleteLifeEvent as deleteLifeEventRaw,
  updateLifeEvent,
} from "@/lib/life-events";
import { createClient } from "@/lib/supabase/server";
import type { LifeEventType } from "@/lib/types";

export async function createLifeEventForPerson(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  id?: string;
}> {
  const personId = String(formData.get("person_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const eventType = String(formData.get("event_type") ?? "note") as LifeEventType;
  const occurredAtRaw = String(formData.get("occurred_at") ?? "").trim();
  const locationName = String(formData.get("location_name") ?? "").trim();
  // 0029 — strukturierte Geo-Daten aus OSM-Autocomplete optional dabei
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  const placeId = String(formData.get("google_place_id") ?? "").trim() || null;
  const latitude = latitudeRaw ? Number(latitudeRaw) : null;
  const longitude = longitudeRaw ? Number(longitudeRaw) : null;
  const filePath = String(formData.get("file_path") ?? "").trim() || null;
  const fileSizeBytes =
    parseInt(String(formData.get("file_size_bytes") ?? "0"), 10) || null;
  const mimeType = String(formData.get("mime_type") ?? "").trim() || null;

  if (!personId) return { ok: false, error: "person_id fehlt" };
  if (!title) return { ok: false, error: "Titel fehlt" };
  if (!occurredAtRaw) return { ok: false, error: "Datum fehlt" };

  const VALID: LifeEventType[] = [
    "photo",
    "document",
    "voice_note",
    "milestone",
    "note",
  ];
  if (!VALID.includes(eventType)) {
    return { ok: false, error: "Ungültiger event_type" };
  }

  const event = await createLifeEvent({
    title,
    description: description || null,
    event_type: eventType,
    occurred_at: new Date(occurredAtRaw).toISOString(),
    location_name: locationName || null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    google_place_id: placeId,
    file_path: filePath,
    file_size_bytes: fileSizeBytes,
    mime_type: mimeType,
    person_ids: [personId],
  });

  if (!event) return { ok: false, error: "Konnte nicht angelegt werden" };

  // Optional reminder tied to the life event. Best-effort — a failed
  // reminder must not undo the life-event creation.
  const remind = String(formData.get("remind") ?? "") === "on";
  const remindAtRaw = String(formData.get("remind_at") ?? "").trim();
  if (remind && remindAtRaw) {
    const remindAtIso = /^\d{4}-\d{2}-\d{2}$/.test(remindAtRaw)
      ? new Date(`${remindAtRaw}T09:00:00`).toISOString()
      : remindAtRaw;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("reminders").insert({
          user_id: user.id,
          person_id: personId,
          text: `Life Event: ${title}`,
          remind_at: remindAtIso,
          recurrence: "once",
          type: "custom",
          status: "pending",
          source: "manual",
        });
      }
    } catch {
      // ignore — life event is already saved
    }
  }

  revalidatePath(`/people/${personId}`);
  revalidatePath("/lifeline");
  revalidatePath("/inbox");
  return { ok: true, id: event.id };
}

export async function updateLifeEventForPerson(
  eventId: string,
  personId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const eventType = String(formData.get("event_type") ?? "note") as LifeEventType;
  const occurredAtRaw = String(formData.get("occurred_at") ?? "").trim();
  const locationName = String(formData.get("location_name") ?? "").trim();
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  const placeId = String(formData.get("google_place_id") ?? "").trim() || null;
  const latitude = latitudeRaw ? Number(latitudeRaw) : null;
  const longitude = longitudeRaw ? Number(longitudeRaw) : null;
  const filePath = String(formData.get("file_path") ?? "").trim() || null;
  const fileSizeBytesRaw = String(formData.get("file_size_bytes") ?? "").trim();
  const fileSizeBytes = fileSizeBytesRaw
    ? parseInt(fileSizeBytesRaw, 10) || null
    : null;
  const mimeType = String(formData.get("mime_type") ?? "").trim() || null;

  if (!eventId) return { ok: false, error: "event_id fehlt" };
  if (!title) return { ok: false, error: "Titel fehlt" };
  if (!occurredAtRaw) return { ok: false, error: "Datum fehlt" };

  const VALID: LifeEventType[] = [
    "photo",
    "document",
    "voice_note",
    "milestone",
    "note",
  ];
  if (!VALID.includes(eventType)) {
    return { ok: false, error: "Ungültiger event_type" };
  }

  const updated = await updateLifeEvent(eventId, {
    title,
    description: description || null,
    event_type: eventType,
    occurred_at: new Date(occurredAtRaw).toISOString(),
    location_name: locationName || null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    google_place_id: placeId,
    file_path: filePath,
    file_size_bytes: fileSizeBytes,
    mime_type: mimeType,
  });

  if (!updated) return { ok: false, error: "Update fehlgeschlagen" };

  revalidatePath(`/people/${personId}`);
  revalidatePath("/lifeline");
  return { ok: true };
}

export async function deleteLifeEventAction(
  eventId: string,
  personId: string,
): Promise<{ ok: boolean }> {
  const ok = await deleteLifeEventRaw(eventId);
  if (ok) {
    revalidatePath(`/people/${personId}`);
    revalidatePath("/lifeline");
  }
  return { ok };
}
