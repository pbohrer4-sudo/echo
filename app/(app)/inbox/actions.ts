"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextRemindAt } from "@/lib/recurrence";
import type { Reminder } from "@/lib/types";

export async function completeReminder(id: string) {
  const supabase = await createClient();

  // Read the row first so we can roll forward recurring reminders.
  const { data: existing, error: fetchError } = await supabase
    .from("reminders")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;
  const reminder = existing as Reminder;

  const { error } = await supabase
    .from("reminders")
    .update({ status: "done" })
    .eq("id", id);
  if (error) throw error;

  if (reminder.recurrence !== "once") {
    const next = nextRemindAt(reminder.remind_at, reminder.recurrence);
    if (next) {
      const {
        id: _omitId,
        created_at: _omitCreated,
        ...rest
      } = reminder;
      void _omitId;
      void _omitCreated;
      const { error: insertError } = await supabase.from("reminders").insert({
        ...rest,
        remind_at: next,
        status: "pending",
        source: "ai-generated",
      });
      if (insertError) throw insertError;
    }
  }

  revalidatePath("/inbox");
  revalidatePath("/people", "layout");
}

export async function deleteReminder(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/inbox");
  revalidatePath("/people", "layout");
}

export async function completeTodo(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("todos")
    .update({ status: "done" })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/inbox");
  revalidatePath("/people", "layout");
}

export async function deleteTodo(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("todos").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/inbox");
  revalidatePath("/people", "layout");
}
