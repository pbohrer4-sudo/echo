"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface ProfileUpdate {
  display_name: string | null;
  voice_id: string | null;
  debrief_time: string | null;
  language: string | null;
  message_style: string;
  claude_key_byo?: string | null;
  elevenlabs_key_byo?: string | null;
}

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

export async function updateSettings(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const display_name = trimOrNull(formData.get("display_name"));
  const voice_id = trimOrNull(formData.get("voice_id"));
  const debrief_time = trimOrNull(formData.get("debrief_time"));
  const language = trimOrNull(formData.get("language"));
  const messageStyleRaw = trimOrNull(formData.get("message_style"));
  const message_style =
    messageStyleRaw === "professionell" ? "professionell" : "locker";
  const claudeRaw = formData.get("claude_key_byo");
  const elevenRaw = formData.get("elevenlabs_key_byo");
  const clearClaude = formData.get("clear_claude_key") === "1";
  const clearEleven = formData.get("clear_elevenlabs_key") === "1";

  const update: ProfileUpdate = {
    display_name,
    voice_id,
    debrief_time,
    language,
    message_style,
  };

  if (clearClaude) {
    update.claude_key_byo = null;
  } else if (typeof claudeRaw === "string" && claudeRaw.trim()) {
    update.claude_key_byo = claudeRaw.trim();
  }

  if (clearEleven) {
    update.elevenlabs_key_byo = null;
  } else if (typeof elevenRaw === "string" && elevenRaw.trim()) {
    update.elevenlabs_key_byo = elevenRaw.trim();
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  // Optional return_to lets the inline-tab variant of this form
  // route back to /people/[self.id]?tab=settings instead of the
  // standalone /settings page.
  const returnTo = trimOrNull(formData.get("return_to"));
  const base = returnTo ?? "/settings";
  const join = base.includes("?") ? "&" : "?";

  if (error) {
    redirect(`${base}${join}error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  redirect(`${base}${join}saved=1`);
}
