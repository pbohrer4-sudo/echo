"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function completeReminder(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reminders")
    .update({ status: "done" })
    .eq("id", id);
  if (error) throw error;
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
