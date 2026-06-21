"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Microsoft Graph delegated scopes requested at SSO time. openid/email/
// profile identify the user; offline_access yields a refresh token; the
// Files/Sites scopes let the hub file documents into SharePoint and the
// Mail.Send scope lets it send notification email via Graph.
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

// Start the Microsoft Entra ID (Azure) SSO flow via Supabase Auth. Supabase
// returns the provider authorize URL; we redirect the browser to it. The
// returned provider_token (Graph access token) is persisted in /callback.
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
