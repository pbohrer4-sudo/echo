"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Sets a new password. Reached after the recovery link → /callback
// established a recovery session, so the user is authenticated here.
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    redirect(
      `/reset-password?error=${encodeURIComponent("Passwort muss mindestens 8 Zeichen haben")}`,
    );
  }
  if (password !== confirm) {
    redirect(
      `/reset-password?error=${encodeURIComponent("Passwörter stimmen nicht überein")}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/login?error=${encodeURIComponent("Reset-Link ungültig oder abgelaufen — bitte erneut anfordern")}`,
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/?reset=success");
}
