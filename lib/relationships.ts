import type { SupabaseClient } from "@supabase/supabase-js";

// Beziehungs-Labels die symmetrisch sind (A↔B mit gleichem Label).
// Asymmetrische Kinship (Mutter/Sohn, Vater/Tochter etc.) braucht
// Geschlechts-Info — die spiegeln wir nicht automatisch.
export const SYMMETRIC_LABELS = new Set([
  "Partner:in",
  "Ehepartner:in",
  "Freund:in",
  "Kolleg:in",
]);

export interface RelationshipEntry {
  related_person_id: string;
  label: string;
}

interface RawRelInput {
  related_person_id?: unknown;
  related_person_name?: unknown;
  label?: unknown;
}

// Strict check + normalize — drops anything we can't make sense of.
export function parseRawRel(raw: unknown): {
  id?: string;
  name?: string;
  label: string;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RawRelInput;
  const label = typeof r.label === "string" ? r.label.trim() : "";
  if (!label) return null;
  const id =
    typeof r.related_person_id === "string" && r.related_person_id.trim()
      ? r.related_person_id.trim()
      : undefined;
  const name =
    typeof r.related_person_name === "string" && r.related_person_name.trim()
      ? r.related_person_name.trim()
      : undefined;
  if (!id && !name) return null;
  return { id, name, label };
}

// Resolve a name → uuid using both the just-created map AND a single
// case-insensitive DB query for any unresolved names. Returns a Map
// keyed by lowercased input (id-or-name) → uuid.
export async function resolveRelatedIds({
  supabase,
  userId,
  newByName,
  rawRels,
}: {
  supabase: SupabaseClient;
  userId: string;
  newByName: Map<string, string>;
  rawRels: { id?: string; name?: string; label: string }[];
}): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const namesToLookup: string[] = [];

  for (const r of rawRels) {
    if (r.id) {
      out.set(r.id, r.id);
      continue;
    }
    if (!r.name) continue;
    const lower = r.name.toLowerCase();
    const fromNew = newByName.get(lower);
    if (fromNew) {
      out.set(r.name, fromNew);
      continue;
    }
    namesToLookup.push(r.name);
  }

  if (namesToLookup.length) {
    // Case-insensitive batch lookup — up to ~50 names per turn is
    // realistic, well within a single SELECT.
    const orFilter = namesToLookup
      .map((n) => `name.ilike.${n.replace(/[,)]/g, "")}`)
      .join(",");
    const { data } = await supabase
      .from("people")
      .select("id, name")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .or(orFilter);
    for (const row of (data ?? []) as { id: string; name: string }[]) {
      const matched = namesToLookup.find(
        (n) => n.toLowerCase() === row.name.toLowerCase(),
      );
      if (matched) out.set(matched, row.id);
    }
  }

  return out;
}

// Merge new relationships into an existing list, dedup by
// (related_person_id, label).
export function mergeRels(
  existing: RelationshipEntry[],
  incoming: RelationshipEntry[],
): RelationshipEntry[] {
  const seen = new Set<string>();
  const out: RelationshipEntry[] = [];
  for (const r of [...existing, ...incoming]) {
    const key = `${r.related_person_id}|${r.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// Apply symmetric mirroring to a directed list of edges.
// Input: edges of (fromId, toId, label).
// Output: same edges + reverse edges for symmetric labels.
export function mirrorSymmetric(
  edges: { from: string; to: string; label: string }[],
): { from: string; to: string; label: string }[] {
  const out = [...edges];
  const seen = new Set(edges.map((e) => `${e.from}|${e.to}|${e.label}`));
  for (const e of edges) {
    if (!SYMMETRIC_LABELS.has(e.label)) continue;
    if (e.from === e.to) continue;
    const reverseKey = `${e.to}|${e.from}|${e.label}`;
    if (seen.has(reverseKey)) continue;
    seen.add(reverseKey);
    out.push({ from: e.to, to: e.from, label: e.label });
  }
  return out;
}

// Apply a batch of relationship edges to the people table. Reads
// existing relationships per person, merges, writes back. Filters
// every read/write to the user_id + non-deleted to defense-in-depth
// against forged ids.
export async function applyRelationshipEdges({
  supabase,
  userId,
  edges,
}: {
  supabase: SupabaseClient;
  userId: string;
  edges: { from: string; to: string; label: string }[];
}): Promise<void> {
  if (edges.length === 0) return;
  const byPerson = new Map<string, RelationshipEntry[]>();
  for (const e of edges) {
    const list = byPerson.get(e.from) ?? [];
    list.push({ related_person_id: e.to, label: e.label });
    byPerson.set(e.from, list);
  }

  const personIds = Array.from(byPerson.keys());
  const { data: existingRows } = await supabase
    .from("people")
    .select("id, relationships")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("id", personIds);

  const existingByPerson = new Map<string, RelationshipEntry[]>();
  for (const row of (existingRows ?? []) as {
    id: string;
    relationships: unknown;
  }[]) {
    const list = Array.isArray(row.relationships)
      ? (row.relationships as RelationshipEntry[]).filter(
          (r) =>
            r &&
            typeof r === "object" &&
            typeof r.related_person_id === "string" &&
            typeof r.label === "string",
        )
      : [];
    existingByPerson.set(row.id, list);
  }

  for (const [personId, incoming] of byPerson) {
    const existing = existingByPerson.get(personId) ?? [];
    const merged = mergeRels(existing, incoming);
    await supabase
      .from("people")
      .update({ relationships: merged })
      .eq("id", personId)
      .eq("user_id", userId)
      .is("deleted_at", null);
  }
}
