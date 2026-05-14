"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function bulkDeleteOrganizationsAction(
  ids: string[],
): Promise<{ ok: boolean; deleted: number; error?: string }> {
  if (!ids || ids.length === 0) return { ok: true, deleted: 0 };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, deleted: 0, error: "unauth" };

  const { data, error } = await supabase
    .from("organizations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .in("id", ids)
    .select("id");

  if (error) return { ok: false, deleted: 0, error: error.message };
  revalidatePath("/organizations");
  return { ok: true, deleted: (data ?? []).length };
}
