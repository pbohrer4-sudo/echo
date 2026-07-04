import { createClient } from "@/lib/supabase/server";
import type { PmRequestForm } from "./types";

// Dynamic request forms: structured intake instead of email/Slack pings.
// A submission creates a task in the target department (optionally from a
// blueprint) with the answers captured in custom_fields.

export async function listRequestForms(
  workspaceId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<PmRequestForm[]> {
  const supabase = await createClient();
  let query = supabase
    .from("pm_request_forms")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  if (opts.activeOnly) query = query.eq("active", true);
  const { data } = await query.order("created_at", { ascending: true });
  return (data ?? []) as PmRequestForm[];
}

export async function getRequestForm(
  id: string,
): Promise<PmRequestForm | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_request_forms")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as PmRequestForm) ?? null;
}
