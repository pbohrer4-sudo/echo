"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { modelById, TASKS, type TaskId } from "@/lib/model-catalog";

export async function setTaskModel(task: TaskId, modelId: string) {
  const known = TASKS.find((t) => t.id === task);
  if (!known) throw new Error(`Unknown task: ${task}`);

  // Empty string clears the override and falls back to the default.
  if (modelId !== "" && !modelById(modelId)) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("model_preferences")
    .eq("id", user.id)
    .maybeSingle();

  const prefs =
    (profile?.model_preferences as Record<string, string> | null) ?? {};
  if (modelId === "") {
    delete prefs[task];
  } else {
    prefs[task] = modelId;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ model_preferences: prefs })
    .eq("id", user.id);
  if (error) throw error;

  revalidatePath("/models");
  revalidatePath("/", "layout");
}
