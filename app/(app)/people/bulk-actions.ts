"use server";

// Bulk-Mutations für die People-Liste — Soft-Delete via deleted_at.
// RLS + explizite user_id-Filter machen es safe gegen forged IDs.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function bulkDeletePeopleAction(
  ids: string[],
): Promise<{ ok: boolean; deleted: number; error?: string }> {
  if (!ids || ids.length === 0) return { ok: true, deleted: 0 };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, deleted: 0, error: "unauth" };

  // Self-Person ausschließen — wir wollen nicht aus Versehen das
  // eigene Profil löschen wenn jemand alle markiert.
  const { data, error } = await supabase
    .from("people")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("is_self", false)
    .is("deleted_at", null)
    .in("id", ids)
    .select("id");

  if (error) return { ok: false, deleted: 0, error: error.message };
  revalidatePath("/people");
  return { ok: true, deleted: (data ?? []).length };
}
