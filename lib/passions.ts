// Passions-Helper (Briefing v3 #19). Identitätsstiftende Interessen
// pro Person. Kein hartes Limit mehr (0045) — fokussiert halten, aber
// wenn es mehr sind, dürfen es mehr sein.

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

// Distinct passion names the user has used across all their people —
// powers same-category autocomplete in the passion input. RLS-scoped.
export async function listAllPassionNames(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("passions")
    .select("name")
    .eq("user_id", user.id);
  if (error) {
    console.error("[passions] listAllPassionNames failed", error);
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of (data ?? []) as { name: string }[]) {
    const n = row.name?.trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export async function addPassion(
  personId: string,
  name: string,
): Promise<{ ok: boolean; reason?: "duplicate" | "error" }> {
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
