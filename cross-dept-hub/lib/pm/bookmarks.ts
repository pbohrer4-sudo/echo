import { createClient } from "@/lib/supabase/server";
import type { PmBookmark } from "./types";

// Space bookmarks (Wrike: quick links pinned to a space, optionally in
// sections). department_id null = workspace-wide bookmark.

export async function listBookmarks(
  departmentId: string,
): Promise<PmBookmark[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_bookmarks")
    .select("*")
    .eq("department_id", departmentId)
    .order("section", { ascending: true, nullsFirst: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as PmBookmark[];
}
