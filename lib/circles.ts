// Circles-Helper (Briefing v3 #19). Communities + Organisationen die
// Personen verbinden. Z.B. „Munich Founder Network", „YC W22",
// „Bauma 2024 Attendees".

import { createClient } from "@/lib/supabase/server";
import type { CircleRow, CircleWithNote } from "@/lib/types";

export async function listAllCircles(): Promise<CircleRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("circles")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });
  if (error) {
    console.error("[circles] listAll failed", error);
    return [];
  }
  return (data ?? []) as CircleRow[];
}

export async function listCirclesForPerson(
  personId: string,
): Promise<CircleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_circles")
    .select("circles(*)")
    .eq("person_id", personId);
  if (error) {
    console.error("[circles] listForPerson failed", error);
    return [];
  }
  const rows = (data ?? []) as unknown as { circles: CircleRow | null }[];
  return rows
    .map((r) => r.circles)
    .filter((c): c is CircleRow => c !== null);
}

/**
 * Idempotent: holt Circle wenn existiert (case-insensitive match), sonst
 * legt es an. Wie getOrCreateTag — race-safe via unique-constraint.
 */
export async function getOrCreateCircle(
  name: string,
  description?: string | null,
): Promise<CircleRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from("circles")
    .select("*")
    .eq("user_id", user.id)
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing) return existing as CircleRow;

  const { data: inserted, error } = await supabase
    .from("circles")
    .insert({
      user_id: user.id,
      name: trimmed,
      description: description ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Race: jemand anders war schneller — re-select.
      const { data: retry } = await supabase
        .from("circles")
        .select("*")
        .eq("user_id", user.id)
        .ilike("name", trimmed)
        .maybeSingle();
      return (retry as CircleRow) ?? null;
    }
    console.error("[circles] getOrCreate failed", error);
    return null;
  }
  return inserted as CircleRow;
}

export async function addPersonToCircle(
  personId: string,
  circleId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("person_circles")
    .insert({ person_id: personId, circle_id: circleId });
  if (!error) return true;
  // 23505 = schon Mitglied — ist kein Fehler.
  if (error.code === "23505") return true;
  console.error("[circles] addPersonToCircle failed", error);
  return false;
}

export async function removePersonFromCircle(
  personId: string,
  circleId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("person_circles")
    .delete()
    .eq("person_id", personId)
    .eq("circle_id", circleId);
  if (error) {
    console.error("[circles] removePersonFromCircle failed", error);
    return false;
  }
  return true;
}

// 0028 — Circles für eine Person inkl. per-Link-Note aus person_circles.
export async function listCirclesWithNotesForPerson(
  personId: string,
): Promise<CircleWithNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_circles")
    .select("note, circles(id, name, description)")
    .eq("person_id", personId);
  if (error) {
    console.error("[circles] listCirclesWithNotesForPerson failed", error);
    return [];
  }
  const rows = (data ?? []) as unknown as {
    note: string | null;
    circles: {
      id: string;
      name: string;
      description: string | null;
    } | null;
  }[];
  return rows
    .filter(
      (r): r is typeof r & {
        circles: { id: string; name: string; description: string | null };
      } => r.circles !== null,
    )
    .map((r) => ({
      id: r.circles.id,
      name: r.circles.name,
      description: r.circles.description,
      note: r.note,
    }));
}

// 0028 — Note auf person_circles setzen/löschen.
export async function updatePersonCircleNote(
  personId: string,
  circleId: string,
  note: string | null,
): Promise<boolean> {
  const supabase = await createClient();
  const normalized = note?.trim() ? note.trim() : null;
  const { error } = await supabase
    .from("person_circles")
    .update({ note: normalized })
    .eq("person_id", personId)
    .eq("circle_id", circleId);
  if (error) {
    console.error("[circles] updatePersonCircleNote failed", error);
    return false;
  }
  return true;
}
