"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Sends a password-reset email. The link in the email points at
// /callback?next=/reset-password, which exchanges the recovery code for
// a session and lands the user on the reset form.
//
// Security: we ALWAYS report success, regardless of whether the email is
// registered — never reveal which addresses have accounts.
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect(
      `/forgot-password?error=${encodeURIComponent("Email fehlt")}`,
    );
  }

  const h = await headers();
  const origin =
    h.get("origin") ??
    (h.get("host") ? `https://${h.get("host")}` : "");

  const supabase = await createClient();
  // Best-effort — ignore the result so timing/errors don't leak account
  // existence.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/callback?next=/reset-password`,
  });

  redirect("/forgot-password?sent=1");
}
