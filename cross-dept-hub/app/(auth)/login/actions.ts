"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Microsoft Graph delegated scopes requested at SSO time. The Files/Sites
// scopes let the hub file documents into SharePoint; Mail.Send lets it send
// notification email via Graph. Optional — email/password login works
// without any Azure setup.
const MICROSOFT_SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "https://graph.microsoft.com/Files.ReadWrite.All",
  "https://graph.microsoft.com/Sites.ReadWrite.All",
  "https://graph.microsoft.com/Mail.Send",
].join(" ");

async function resolveOrigin(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (envUrl) return envUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    redirect("/login?error=Bitte+Email+und+Passwort+eingeben");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/teams");
}

export async function register(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) {
    redirect("/register?error=Passwort+muss+mind.+8+Zeichen+haben");
  }

  const supabase = await createClient();
  const origin = await resolveOrigin();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/callback?next=/teams` },
  });
  if (error) {
    redirect(`/register?error=${encodeURIComponent(error.message)}`);
  }
  // If email confirmation is disabled, the user is signed in immediately.
  redirect("/teams");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Start the Microsoft Entra ID (Azure) SSO flow via Supabase Auth.
export async function signInWithMicrosoft() {
  const supabase = await createClient();
  const origin = await resolveOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: `${origin}/callback?next=/teams`,
      scopes: MICROSOFT_SCOPES,
    },
  });
  if (error || !data?.url) {
    redirect(
      `/login?error=${encodeURIComponent(error?.message ?? "Microsoft-Login nicht verfügbar")}`,
    );
  }
  redirect(data.url);
}
