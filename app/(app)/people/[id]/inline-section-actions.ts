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
import { rememberCustomDateLabel } from "@/lib/custom-date-labels";

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
  // Lead-Tage konfigurierbar (0..365). Vorher hart 7 — User wollte
  // eigene Wahl, z.B. „am Tag" (0) oder „1 Monat vorher" (30).
  const leadRaw = String(formData.get("remind_lead_days") ?? "7").trim();
  const leadDays = remind
    ? Math.max(0, Math.min(365, parseInt(leadRaw, 10) || 0))
    : undefined;

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
    { label, date, remind, remind_lead_days: leadDays },
  ];

  const { error } = await supabase
    .from("people")
    .update({ important_dates: next })
    .eq("id", personId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  // Auto-remember a custom occasion so it appears in the dropdown next
  // time. No-op for built-in defaults / "andere".
  await rememberCustomDateLabel(supabase, user.id, label);

  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

// ───────── Beziehungen ─────────

// Inline-Person anlegen aus der Beziehungs-Form: nur Name, sonst leer.
// Wird vom Combobox-Picker getriggert wenn der getippte Name nicht
// in der Kandidatenliste matched. Vermeidet, dass der User die
// Seite wechseln muss um einen flüchtigen Kontakt anzulegen.
export async function createMinimalPersonAction(
  formData: FormData,
): Promise<Result & { id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauth" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name fehlt" };

  const { data, error } = await supabase
    .from("people")
    .insert({
      user_id: user.id,
      name,
      purpose: "personal",
      // mode + depth_source haben DB-Defaults (active / auto), Rest
      // bleibt NULL. Reicht für „flüchtig referenzierte Person".
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert fehlgeschlagen" };
  }
  revalidatePath("/people");
  return { ok: true, id: (data as { id: string }).id };
}

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

// ───────── Gifts (gift_idea) ─────────
// gift_idea ist ein TEXT-Feld; mehrere Ideen werden mit ' · ' getrennt
// (gleiche Konvention wie Voice-Extract in /api/extract/commit). Diese
// Helpers parsen/serialisieren konsistent.

const GIFT_SEPARATOR = " · ";

function splitGifts(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(GIFT_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinGifts(items: string[]): string | null {
  const cleaned = items.map((s) => s.trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(GIFT_SEPARATOR) : null;
}

async function readGiftIdea(
  supabase: SupabaseLike,
  personId: string,
  userId: string,
): Promise<string | null | undefined> {
  const { data, error } = await supabase
    .from("people")
    .select("gift_idea")
    .eq("id", personId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return undefined;
  return (data as { gift_idea: string | null }).gift_idea;
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

// Einen neuen Geschenkidee-Eintrag anhängen (case-insensitive dedup).
export async function addGiftIdeaAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauth" };

  const personId = String(formData.get("person_id") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  if (!personId) return { ok: false, error: "person_id fehlt" };
  if (!value) return { ok: false, error: "leerer Wert" };

  const current = await readGiftIdea(supabase, personId, user.id);
  if (current === undefined) return { ok: false, error: "Person nicht gefunden" };

  const items = splitGifts(current);
  if (items.some((it) => it.toLowerCase() === value.toLowerCase())) {
    // schon da → ok, kein Fehler, kein Insert
    return { ok: true };
  }
  items.push(value);

  const { error } = await supabase
    .from("people")
    .update({ gift_idea: joinGifts(items) })
    .eq("id", personId)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

// Einen einzelnen Eintrag entfernen (case-insensitive Match).
export async function removeGiftIdeaAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauth" };

  const personId = String(formData.get("person_id") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  if (!personId) return { ok: false, error: "person_id fehlt" };
  if (!value) return { ok: false, error: "leerer Wert" };

  const current = await readGiftIdea(supabase, personId, user.id);
  if (current === undefined) return { ok: false, error: "Person nicht gefunden" };

  const items = splitGifts(current).filter(
    (it) => it.toLowerCase() !== value.toLowerCase(),
  );

  const { error } = await supabase
    .from("people")
    .update({ gift_idea: joinGifts(items) })
    .eq("id", personId)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

// Legacy REPLACE-Pfad — von älteren UI-Pfaden noch benutzt, einfach
// drinlassen damit nichts bricht. Setzt das ganze Feld auf einen Wert.
export async function setGiftIdeaAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauth" };

  const personId = String(formData.get("person_id") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  if (!personId) return { ok: false, error: "person_id fehlt" };

  const { error } = await supabase
    .from("people")
    .update({ gift_idea: value || null })
    .eq("id", personId)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

// ───────── Timeline-Events (interactions) ─────────
// Manuell hinzugefügte Ereignisse landen in derselben interactions-
// Tabelle wie Voice-/Debrief-Logs, source='manual' damit man später
// filtern könnte. Bump auch last_contact_at — wer ein Event in die
// Vergangenheit setzt sollte mit dem letzten Kontakt-Datum dort
// landen.

const INTERACTION_TYPES = ["meeting", "call", "email", "note", "voice"] as const;
type InteractionTypeLiteral = (typeof INTERACTION_TYPES)[number];
const SENTIMENTS = ["positive", "neutral", "tense"] as const;
type SentimentLiteral = (typeof SENTIMENTS)[number];

// Welche Datei-Typen wir versuchen als Transcript zu extrahieren.
// text/* und markdown lesen wir direkt; PDFs könnten via Anthropic
// Vision extrahiert werden — das ist aber ein Mehraufwand pro Submit
// (zusätzliche LLM-Latenz, eigener Pfad), den wir später nachziehen.
// Vorerst nur text-Files. Andere Formate werden gespeichert ohne
// Auto-Transcript; der User kann den Text manuell in summary tippen.
function isExtractableText(mime: string | null): boolean {
  if (!mime) return false;
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/markdown"
  );
}

const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export async function addEventAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauth" };

  const personId = String(formData.get("person_id") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "meeting").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurred_at") ?? "").trim();
  const sentimentRaw = String(formData.get("sentiment") ?? "").trim();
  const topicsRaw = String(formData.get("topics") ?? "").trim();
  const file = formData.get("file");

  if (!personId) return { ok: false, error: "person_id fehlt" };
  if (!summary && !(file instanceof File)) {
    return { ok: false, error: "Beschreibung oder Datei nötig" };
  }

  const type: InteractionTypeLiteral = (INTERACTION_TYPES as readonly string[]).includes(
    typeRaw,
  )
    ? (typeRaw as InteractionTypeLiteral)
    : "meeting";

  const sentiment: SentimentLiteral | null = (SENTIMENTS as readonly string[]).includes(
    sentimentRaw,
  )
    ? (sentimentRaw as SentimentLiteral)
    : null;

  const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(occurredAtRaw)
    ? new Date(`${occurredAtRaw}T12:00:00`).toISOString()
    : new Date().toISOString();

  const topics = topicsRaw
    ? topicsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  // Datei-Upload (optional). Falls present:
  //  1. Größe + MIME validieren (Bucket-Whitelist macht das nochmal).
  //  2. In life-events-Bucket unter {user_id}/interactions/{id}/{name}.
  //  3. Text-Files direkt in transcript packen damit der LLM-Kontext
  //     sie sieht.
  let filePath: string | null = null;
  let fileName: string | null = null;
  let fileSize: number | null = null;
  let mimeType: string | null = null;
  let transcript: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > ATTACHMENT_MAX_BYTES) {
      return { ok: false, error: "Datei zu groß (max 25 MB)" };
    }
    mimeType = file.type || "application/octet-stream";
    fileName = file.name || "upload";
    fileSize = file.size;

    // Datei-Bytes lesen und für eventuelles Transcript merken.
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (isExtractableText(mimeType)) {
      try {
        transcript = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        // Auf 100k Chars cappen damit transcript nicht beliebig wächst
        // und LLM-Prompt explodiert.
        if (transcript.length > 100_000) {
          transcript = `${transcript.slice(0, 100_000)}\n\n[…gekürzt nach 100k Zeichen…]`;
        }
      } catch {
        transcript = null;
      }
    }
  }

  const { data: inserted, error } = await supabase
    .from("interactions")
    .insert({
      user_id: user.id,
      person_ids: [personId],
      type,
      source: "manual",
      summary: summary || (fileName ? `Datei: ${fileName}` : null),
      sentiment,
      topics,
      occurred_at: occurredAt,
      transcript,
      file_name: fileName,
      file_size_bytes: fileSize,
      mime_type: mimeType,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }
  const interactionId = (inserted as { id: string }).id;

  // Datei jetzt hochladen — wir kennen die interaction_id und können
  // den finalen Path setzen. Bei Upload-Fehler: row löschen damit
  // wir keine dangling references hinterlassen.
  if (file instanceof File && file.size > 0 && fileName) {
    filePath = `${user.id}/interactions/${interactionId}/${fileName}`;
    const { error: upErr } = await supabase.storage
      .from("life-events")
      .upload(filePath, file, { contentType: mimeType ?? undefined, upsert: false });
    if (upErr) {
      await supabase.from("interactions").delete().eq("id", interactionId);
      return { ok: false, error: `Upload: ${upErr.message}` };
    }
    await supabase
      .from("interactions")
      .update({ file_path: filePath })
      .eq("id", interactionId);
  }

  // last_contact_at synchron halten.
  const { data: existing } = await supabase
    .from("people")
    .select("last_contact_at")
    .eq("id", personId)
    .eq("user_id", user.id)
    .maybeSingle();
  const existingLast = existing?.last_contact_at as string | null;
  if (!existingLast || existingLast < occurredAt) {
    await supabase
      .from("people")
      .update({ last_contact_at: occurredAt })
      .eq("id", personId)
      .eq("user_id", user.id)
      .is("deleted_at", null);
  }

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
