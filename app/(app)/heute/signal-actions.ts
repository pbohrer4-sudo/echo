"use server";

// Pro-Signal Reminder anlegen. Der Reminder-Text bekommt das Signal
// als Anker („Signal: geburtstag-26-march für Mara") damit
// listSignals.has_active_reminder ihn beim nächsten Render erkennt.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const VALID_RECURRENCE = new Set(["once", "weekly", "monthly", "yearly"]);

export async function createReminderFromSignal(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const personId = String(formData.get("person_id") ?? "").trim();
  const signalName = String(formData.get("signal_name") ?? "").trim();
  const personName = String(formData.get("person_name") ?? "").trim();
  const remindAt = String(formData.get("remind_at") ?? "").trim();
  const recurrence = String(formData.get("recurrence") ?? "once");

  if (!personId || !signalName || !remindAt) return;

  // remind_at kommt aus <input type="date"> → 'YYYY-MM-DD'. Wir
  // setzen 09:00 Lokalzeit als sensible Default-Uhrzeit, sonst feuert
  // der Reminder um Mitternacht (UTC-Verschiebung).
  const remindAtIso = /^\d{4}-\d{2}-\d{2}$/.test(remindAt)
    ? new Date(`${remindAt}T09:00:00`).toISOString()
    : remindAt;

  const rec = VALID_RECURRENCE.has(recurrence) ? recurrence : "once";

  await supabase.from("reminders").insert({
    user_id: user.id,
    person_id: personId,
    text: `Signal: ${signalName}${personName ? ` · ${personName}` : ""}`,
    remind_at: remindAtIso,
    recurrence: rec,
    type: "custom",
    status: "pending",
    source: "manual",
  });

  revalidatePath("/heute");
  revalidatePath("/inbox");
}
