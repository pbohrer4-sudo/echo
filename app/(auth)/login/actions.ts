"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Magic-link sign-in. Initiated FROM the app so it uses the SSR PKCE flow:
// the email link carries `?code=` and lands on /callback, which exchanges
// it for a cookie session. (Dashboard-sent magic links use the implicit
// hash-token flow, which our SSR /callback can't consume.)
//
// emailRedirectTo is derived from the request origin so it always points
// at the deployment the user is actually on. That origin MUST be present
// in Supabase Auth -> URL Configuration -> Redirect URLs, otherwise
// Supabase falls back to the Site URL.
//
// Privacy: always report "sent", never reveal whether the address has an
// account (same stance as the password-reset flow).
export async function signInWithMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect(`/login?error=${encodeURIComponent("Email fehlt")}`);
  }

  const h = await headers();
  const origin =
    h.get("origin") ??
    (h.get("host") ? `https://${h.get("host")}` : "");

  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/callback`,
      shouldCreateUser: false,
    },
  });

  redirect("/login?magic=sent");
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=missing-credentials");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}
