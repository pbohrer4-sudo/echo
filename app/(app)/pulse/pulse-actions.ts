"use server";

// Server-Actions für den Sonntags-Puls (Re-Design). Pro Item-Typ eine
// Action plus generischer Snooze-Helper für Personen.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function daysFromNowIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Stale-Person snoozen — setzt people.next_nudge_at auf jetzt + days.
 * Solange next_nudge_at in der Zukunft liegt, taucht die Person nicht
 * mehr im Stale-Block auf (siehe listPulseData filter).
 */
export async function snoozePersonAction(
  personId: string,
  days: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ next_nudge_at: daysFromNowIso(days) })
    .eq("id", personId)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pulse");
  revalidatePath("/heute");
  return { ok: true };
}

/**
 * Reminder snoozen — verschiebt remind_at nach hinten.
 * Status bleibt 'pending'.
 */
export async function snoozeReminderAction(
  reminderId: string,
  days: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reminders")
    .update({ remind_at: daysFromNowIso(days) })
    .eq("id", reminderId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pulse");
  revalidatePath("/inbox");
  revalidatePath("/heute");
  return { ok: true };
}

export async function markReminderDoneAction(
  reminderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reminders")
    .update({ status: "done" })
    .eq("id", reminderId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pulse");
  revalidatePath("/inbox");
  revalidatePath("/heute");
  return { ok: true };
}

export async function markTodoDoneAction(
  todoId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("todos")
    .update({ status: "done" })
    .eq("id", todoId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pulse");
  revalidatePath("/inbox");
  revalidatePath("/heute");
  return { ok: true };
}

/**
 * Todo um N Tage verschieben — setzt due_date neu wenn vorhanden,
 * sonst legt es ein due_date an.
 */
export async function snoozeTodoAction(
  todoId: string,
  days: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + days);
  const due = dueDate.toISOString().slice(0, 10);
  const { error } = await supabase
    .from("todos")
    .update({ due_date: due })
    .eq("id", todoId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pulse");
  revalidatePath("/inbox");
  revalidatePath("/heute");
  return { ok: true };
}
