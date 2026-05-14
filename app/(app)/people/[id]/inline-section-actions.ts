"use server";

// Server-Actions für die inline „+Feldname"-Buttons auf der Person-
// Detail-Page. Pro Sektion ein flacher Endpoint — alle revalidaten
// /people/{id} damit die Sektion direkt aktualisiert wird.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  ImportantDate,
  GeoType,
  RelationshipType,
} from "@/lib/types";
import { GEO_TYPES, RELATIONSHIP_TYPES } from "@/lib/types";
import { createGeography } from "@/lib/person-geographies";
import { createRelationship } from "@/lib/person-relationships";
import { parseLocationGeo } from "@/lib/location-geo-parse";

interface Result {
  ok: boolean;
  error?: string;
}

// ───────── Wichtige Daten ─────────

export async function addImportantDateAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauth" };

  const personId = String(formData.get("person_id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const remind = String(formData.get("remind") ?? "") === "on";

  if (!personId || !label || !date) return { ok: false, error: "Feld fehlt" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "Datum ungültig" };
  }

  // important_dates ist ein JSONB-Array auf people — read-merge-write.
  const { data: row, error: fetchErr } = await supabase
    .from("people")
    .select("important_dates")
    .eq("id", personId)
    .maybeSingle();
  if (fetchErr || !row) return { ok: false, error: "Person nicht gefunden" };

  const existing = (row.important_dates ?? []) as ImportantDate[];
  const next: ImportantDate[] = [
    ...existing,
    { label, date, remind, remind_lead_days: remind ? 7 : undefined },
  ];

  const { error } = await supabase
    .from("people")
    .update({ important_dates: next })
    .eq("id", personId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

// ───────── Beziehungen ─────────

export async function addRelationshipAction(
  formData: FormData,
): Promise<Result> {
  const personId = String(formData.get("person_id") ?? "").trim();
  const relatedPersonId = String(formData.get("related_person_id") ?? "").trim();
  const typeRaw = String(formData.get("relationship_type") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();

  if (!personId || !relatedPersonId) return { ok: false, error: "Person fehlt" };
  if (!(RELATIONSHIP_TYPES as readonly string[]).includes(typeRaw)) {
    return { ok: false, error: "Beziehungs-Typ ungültig" };
  }
  const created = await createRelationship({
    person_id: personId,
    related_person_id: relatedPersonId,
    relationship_type: typeRaw as RelationshipType,
    label: label || null,
    created_by: "user",
  });
  if (!created) return { ok: false, error: "Fehler beim Anlegen" };
  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

// ───────── Erinnerungen ─────────

export async function addReminderAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauth" };

  const personId = String(formData.get("person_id") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  const remindAtRaw = String(formData.get("remind_at") ?? "").trim();
  const recurrence = String(formData.get("recurrence") ?? "once");

  if (!personId || !text || !remindAtRaw)
    return { ok: false, error: "Feld fehlt" };

  // date-input → ISO mit 09:00 lokal damit kein UTC-Mitternacht-Drift.
  const remindAtIso = /^\d{4}-\d{2}-\d{2}$/.test(remindAtRaw)
    ? new Date(`${remindAtRaw}T09:00:00`).toISOString()
    : remindAtRaw;

  const validRec = ["once", "weekly", "monthly", "yearly"].includes(recurrence)
    ? recurrence
    : "once";

  const { error } = await supabase.from("reminders").insert({
    user_id: user.id,
    person_id: personId,
    text,
    remind_at: remindAtIso,
    recurrence: validRec,
    type: "custom",
    status: "pending",
    source: "manual",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/people/${personId}`);
  revalidatePath("/inbox");
  return { ok: true };
}

// ───────── Aufgaben ─────────

export async function addTodoAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauth" };

  const personId = String(formData.get("person_id") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  const dueDateRaw = String(formData.get("due_date") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "medium");

  if (!personId || !text) return { ok: false, error: "Feld fehlt" };

  const dueDate =
    dueDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw) ? dueDateRaw : null;
  const priority = ["low", "medium", "high"].includes(priorityRaw)
    ? priorityRaw
    : "medium";

  const { error } = await supabase.from("todos").insert({
    user_id: user.id,
    person_id: personId,
    text,
    due_date: dueDate,
    priority,
    status: "open",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/people/${personId}`);
  revalidatePath("/inbox");
  return { ok: true };
}

// ───────── Geographies ─────────

export async function addGeographyAction(formData: FormData): Promise<Result> {
  const personId = String(formData.get("person_id") ?? "").trim();
  const geoTypeRaw = String(formData.get("geo_type") ?? "").trim();
  const displayName = String(formData.get("location") ?? "").trim();
  const customLabel = String(formData.get("custom_label") ?? "").trim();
  const geo = parseLocationGeo(formData.get("location_geo"));

  if (!personId || !displayName) return { ok: false, error: "Ort fehlt" };
  if (!(GEO_TYPES as readonly string[]).includes(geoTypeRaw)) {
    return { ok: false, error: "Typ ungültig" };
  }

  const created = await createGeography({
    person_id: personId,
    geo_type: geoTypeRaw as GeoType,
    custom_label: geoTypeRaw === "custom" ? customLabel || null : null,
    display_name: geo?.display_name ?? displayName,
    latitude: geo?.lat ?? null,
    longitude: geo?.lng ?? null,
    place_id: geo?.place_id ?? null,
  });
  if (!created) return { ok: false, error: "Fehler beim Anlegen" };
  revalidatePath(`/people/${personId}`);
  return { ok: true };
}
