import { createClient } from "@/lib/supabase/server";
import type { PmWorkspace } from "./types";

// Resolves the workspace the signed-in user works in. For the MVP every
// user gets one workspace; the first time they open /teams we create it
// and add them as the owning member. Multi-workspace selection can layer
// on top later without changing callers (they always ask for "the current
// workspace").
export async function getOrCreateWorkspace(): Promise<PmWorkspace> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Already a member of a workspace? Use the oldest one.
  const { data: memberships } = await supabase
    .from("pm_workspace_members")
    .select("workspace_id, pm_workspaces(*)")
    .order("created_at", { ascending: true })
    .limit(1);

  const existing = memberships?.[0]?.pm_workspaces as PmWorkspace | undefined;
  if (existing) return existing;

  // Bootstrap a fresh workspace + owner membership.
  const defaultName = user.email ? `${user.email.split("@")[0]} Workspace` : "Workspace";
  const { data: ws, error } = await supabase
    .from("pm_workspaces")
    .insert({ name: defaultName, created_by: user.id })
    .select("*")
    .single();
  if (error || !ws) {
    throw new Error(`Workspace konnte nicht erstellt werden: ${error?.message}`);
  }

  const { error: memberError } = await supabase
    .from("pm_workspace_members")
    .insert({
      workspace_id: ws.id,
      user_id: user.id,
      role: "lead",
      display_name: user.email?.split("@")[0] ?? null,
    });
  if (memberError) {
    throw new Error(`Mitgliedschaft fehlgeschlagen: ${memberError.message}`);
  }

  return ws as PmWorkspace;
}

export interface WorkspaceMember {
  user_id: string;
  role: string;
  display_name: string | null;
}

export async function listWorkspaceMembers(
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_workspace_members")
    .select("user_id, role, display_name")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  return (data ?? []) as WorkspaceMember[];
}
