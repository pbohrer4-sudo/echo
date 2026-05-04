import { createClient } from "@/lib/supabase/server";
import type { ServiceConnection } from "@/lib/types";

export async function listConnections(): Promise<ServiceConnection[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_connections")
    .select("*")
    .is("deleted_at", null)
    .order("provider", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ServiceConnection[];
}

export async function getConnectionByProvider(
  provider: string,
): Promise<ServiceConnection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_connections")
    .select("*")
    .eq("provider", provider)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as ServiceConnection) ?? null;
}
