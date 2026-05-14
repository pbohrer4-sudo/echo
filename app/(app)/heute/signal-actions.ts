"use server";

// Reminder-Anlage aus einem Signal-Tag. Unterstützt das Pattern
// „N Tage vorher + am Tag selbst" was bei Hochzeitstagen,
// Geburtstagen etc. typisch ist.
//
// Datenmodell: pro Signal werden 1 oder 2 Reminder-Rows geschrieben:
//   - row 1: remind_at = date - lead_days, recurrence (z.B. yearly)
//   - row 2: remind_at = date,             recurrence (only wenn also_on_day=true)
// Beide haben denselben text mit dem Signal-Namen als Anker damit
// listSignals.has_active_reminder beim nächsten Render greift.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const VALID_RECURRENCE = new Set(["once", "weekly", "monthly", "yearly"]);

export interface CreateSignalRemindersResult {
  ok: boolean;
  created: number;
  error?: string;
}

// Form-action-compatible Wrapper (returns void) — wird vom <form action>
// auf SignalCard direkt benutzt. Schluckt das Result still, Erfolgs-
// Feedback kommt via revalidatePath.
export async function createReminderFromSignal(
  formData: FormData,
): Promise<void> {
  await createSignalReminders(formData);
}

// Programmatic Variante mit Result — nutzt der PillWithNote-Editor
// auf Person-Detail-Cluster damit das Popover Erfolg/Fehler anzeigen
// kann ohne Page-Reload.
export async function createSignalReminders(
  formData: FormData,
): Promise<CreateSignalRemindersResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, created: 0, error: "unauth" };

  const personId = String(formData.get("person_id") ?? "").trim();
  const signalName = String(formData.get("signal_name") ?? "").trim();
  const personName = String(formData.get("person_name") ?? "").trim();
  const remindAt = String(formData.get("remind_at") ?? "").trim();
  const recurrenceRaw = String(formData.get("recurrence") ?? "yearly");
  const leadDaysRaw = String(formData.get("lead_days") ?? "0").trim();
  const alsoOnDay = String(formData.get("also_on_day") ?? "") === "on";

  if (!personId || !signalName || !remindAt) {
    return { ok: false, created: 0, error: "Feld fehlt" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(remindAt)) {
    return { ok: false, created: 0, error: "Datum ungültig" };
  }

  const recurrence = VALID_RECURRENCE.has(recurrenceRaw)
    ? recurrenceRaw
    : "yearly";
  const leadDays = Math.max(0, Math.min(365, parseInt(leadDaysRaw, 10) || 0));

  // Basis-Datum als Date-Objekt — wir setzen 09:00 lokal damit Reminder
  // nicht nachts um Mitternacht (UTC-Drift) feuern.
  const baseDate = new Date(`${remindAt}T09:00:00`);

  const rows: Record<string, unknown>[] = [];
  // Lead-Reminder nur wenn lead_days > 0, sonst hätten wir zwei
  // identische Rows.
  if (leadDays > 0) {
    const leadDate = new Date(baseDate);
    leadDate.setDate(leadDate.getDate() - leadDays);
    rows.push({
      user_id: user.id,
      person_id: personId,
      text: `Signal: ${signalName}${personName ? ` · ${personName}` : ""} · in ${leadDays} Tag${leadDays === 1 ? "" : "en"}`,
      remind_at: leadDate.toISOString(),
      recurrence,
      type: "custom",
      status: "pending",
      source: "manual",
    });
  }
  // Day-of-Reminder
  if (alsoOnDay || leadDays === 0) {
    rows.push({
      user_id: user.id,
      person_id: personId,
      text: `Signal: ${signalName}${personName ? ` · ${personName}` : ""}`,
      remind_at: baseDate.toISOString(),
      recurrence,
      type: "custom",
      status: "pending",
      source: "manual",
    });
  }
  if (rows.length === 0) {
    return { ok: false, created: 0, error: "Nichts zu speichern" };
  }

  const { error } = await supabase.from("reminders").insert(rows);
  if (error) return { ok: false, created: 0, error: error.message };

  revalidatePath("/heute");
  revalidatePath("/inbox");
  revalidatePath(`/people/${personId}`);
  return { ok: true, created: rows.length };
}
