"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findProvider } from "@/lib/connections-catalog";

export async function startConnect(provider: string) {
  const def = findProvider(provider);
  if (!def) redirect(`/connections?error=unknown_provider`);

  // V1 stub: skip the real OAuth roundtrip and jump straight to our
  // own callback with a synthetic code. V2 swaps this for the real
  // provider authorize URL.
  redirect(`/api/oauth/${provider}/start`);
}

export async function disconnect(provider: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("connections")
    .update({
      deleted_at: new Date().toISOString(),
      status: "disconnected",
      access_token: null,
      refresh_token: null,
    })
    .eq("provider", provider);
  if (error) throw error;
  revalidatePath("/connections");
  redirect("/connections");
}
