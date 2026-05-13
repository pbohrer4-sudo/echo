// Passions-Helper (Briefing v3 #19). Identitätsstiftende Interessen
// pro Person. Max 5 — DB-Trigger enforced das.

import { createClient } from "@/lib/supabase/server";
import type { PassionRow } from "@/lib/types";

export async function listPassionsForPerson(
  personId: string,
): Promise<PassionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("passions")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[passions] list failed", error);
    return [];
  }
  return (data ?? []) as PassionRow[];
}

export async function addPassion(
  personId: string,
  name: string,
): Promise<{ ok: boolean; reason?: "limit" | "duplicate" | "error" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "error" };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: "error" };

  const { error } = await supabase
    .from("passions")
    .insert({ user_id: user.id, person_id: personId, name: trimmed });

  if (!error) return { ok: true };
  if (error.message?.includes("maximum of 5 passions")) {
    return { ok: false, reason: "limit" };
  }
  if (error.code === "23505") {
    // Unique-Constraint auf (person_id, lower(name)) — schon dran.
    return { ok: true };
  }
  console.error("[passions] add failed", error);
  return { ok: false, reason: "error" };
}

export async function removePassion(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("passions").delete().eq("id", id);
  if (error) {
    console.error("[passions] remove failed", error);
    return false;
  }
  return true;
}

// 0028 — Note auf einer Passion setzen/löschen.
export async function updatePassionNote(
  id: string,
  note: string | null,
): Promise<boolean> {
  const supabase = await createClient();
  const normalized = note?.trim() ? note.trim() : null;
  const { error } = await supabase
    .from("passions")
    .update({ note: normalized })
    .eq("id", id);
  if (error) {
    console.error("[passions] updateNote failed", error);
    return false;
  }
  return true;
}
