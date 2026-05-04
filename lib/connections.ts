import { createClient } from "@/lib/supabase/server";
import type { Connection } from "@/lib/types";

export async function listConnections(): Promise<Connection[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .is("deleted_at", null)
    .order("provider", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Connection[];
}

export async function getConnectionByProvider(
  provider: string,
): Promise<Connection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("provider", provider)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as Connection) ?? null;
}
