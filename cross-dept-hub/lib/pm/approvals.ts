import { createClient } from "@/lib/supabase/server";
import type { PmApproval } from "./types";

// Approvals: formalized sign-off with an audit trail (who, when, verdict).

export async function listApprovalsForTask(
  taskId: string,
): Promise<PmApproval[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_approvals")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  return (data ?? []) as PmApproval[];
}

// Approvals waiting on the signed-in user — drives the "Freigaben" inbox.
export async function listMyPendingApprovals(): Promise<PmApproval[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("pm_approvals")
    .select("*")
    .eq("approver_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data ?? []) as PmApproval[];
}

export async function countMyPendingApprovals(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count } = await supabase
    .from("pm_approvals")
    .select("id", { count: "exact", head: true })
    .eq("approver_id", user.id)
    .eq("status", "pending");
  return count ?? 0;
}
