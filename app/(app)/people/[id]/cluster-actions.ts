"use server";

// Server Actions für Tags/Passions/Circles auf der Person-Detail-Page
// (Phase C6, Briefing v3 #19). Wrapped die Helper aus lib/tags.ts,
// lib/passions.ts, lib/circles.ts in Server Actions und revalidaten
// die Detail-Route nach jeder Mutation.

import { revalidatePath } from "next/cache";
import {
  getOrCreateTag,
  addTagToPerson as addTagToPersonRaw,
  removeTagFromPerson as removeTagFromPersonRaw,
  updatePersonTagNote as updatePersonTagNoteRaw,
} from "@/lib/tags";
import {
  addPassion as addPassionRaw,
  removePassion as removePassionRaw,
  updatePassionNote as updatePassionNoteRaw,
} from "@/lib/passions";
import {
  getOrCreateCircle,
  addPersonToCircle as addPersonToCircleRaw,
  removePersonFromCircle as removePersonFromCircleRaw,
  updatePersonCircleNote as updatePersonCircleNoteRaw,
} from "@/lib/circles";
import type { TagCluster } from "@/lib/types";

const CLUSTER_VALUES: TagCluster[] = [
  "reminders",
  "interests",
  "potential",
  "origin",
];

export async function addPersonTag(
  personId: string,
  name: string,
  cluster: TagCluster,
): Promise<{ ok: boolean; error?: string }> {
  if (!CLUSTER_VALUES.includes(cluster)) {
    return { ok: false, error: "Unbekannter Cluster" };
  }
  const tag = await getOrCreateTag({ name, cluster, createdBy: "user" });
  if (!tag) return { ok: false, error: "Tag konnte nicht angelegt werden" };

  const res = await addTagToPersonRaw(personId, tag.id);
  if (!res.ok) {
    if (res.reason === "limit") {
      return { ok: false, error: "Max 7 Tags pro Person erreicht" };
    }
    return { ok: false, error: "Tag konnte nicht zugewiesen werden" };
  }
  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

export async function removePersonTag(
  personId: string,
  tagId: string,
): Promise<{ ok: boolean }> {
  const ok = await removeTagFromPersonRaw(personId, tagId);
  if (ok) revalidatePath(`/people/${personId}`);
  return { ok };
}

export async function addPersonPassion(
  personId: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await addPassionRaw(personId, name);
  if (!res.ok) {
    if (res.reason === "limit") {
      return { ok: false, error: "Max 5 Passions pro Person erreicht" };
    }
    return { ok: false, error: "Passion konnte nicht angelegt werden" };
  }
  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

export async function removePersonPassion(
  personId: string,
  passionId: string,
): Promise<{ ok: boolean }> {
  const ok = await removePassionRaw(passionId);
  if (ok) revalidatePath(`/people/${personId}`);
  return { ok };
}

export async function addPersonCircle(
  personId: string,
  circleName: string,
): Promise<{ ok: boolean; error?: string }> {
  const circle = await getOrCreateCircle(circleName);
  if (!circle) return { ok: false, error: "Circle konnte nicht angelegt werden" };
  const ok = await addPersonToCircleRaw(personId, circle.id);
  if (!ok) return { ok: false, error: "Circle-Zuweisung fehlgeschlagen" };
  revalidatePath(`/people/${personId}`);
  return { ok: true };
}

export async function removePersonCircle(
  personId: string,
  circleId: string,
): Promise<{ ok: boolean }> {
  const ok = await removePersonFromCircleRaw(personId, circleId);
  if (ok) revalidatePath(`/people/${personId}`);
  return { ok };
}

// 0028 — Note-Updates: alle drei Aktionen leeren ein leeres Note-
// Feld zurück nach null und revalidieren die Detail-Route.

export async function updateTagNote(
  personId: string,
  tagId: string,
  note: string | null,
): Promise<{ ok: boolean }> {
  const ok = await updatePersonTagNoteRaw(personId, tagId, note);
  if (ok) revalidatePath(`/people/${personId}`);
  return { ok };
}

export async function updatePassionNote(
  personId: string,
  passionId: string,
  note: string | null,
): Promise<{ ok: boolean }> {
  const ok = await updatePassionNoteRaw(passionId, note);
  if (ok) revalidatePath(`/people/${personId}`);
  return { ok };
}

export async function updateCircleNote(
  personId: string,
  circleId: string,
  note: string | null,
): Promise<{ ok: boolean }> {
  const ok = await updatePersonCircleNoteRaw(personId, circleId, note);
  if (ok) revalidatePath(`/people/${personId}`);
  return { ok };
}
