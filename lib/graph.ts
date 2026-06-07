import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listPeopleWithContext } from "@/lib/people";

// Relationship graph builder (P2). Produces an EGO graph centred on one
// focus person: the focus node + everyone connected to them by an
// explicit relationship OR a shared dimension (circle, organisation,
// city, passion, interest). Plain serialisable shape → the client
// cytoscape component renders it.
//
// Edge weight = sum of the per-dimension weights below. Heavier edges
// render shorter/thicker so the graph clusters the strongest ties near
// the focus.

const WEIGHTS = {
  relationship: 5,
  circle: 3,
  organization: 3,
  city: 1.5,
  passion: 1,
  interest: 1,
} as const;

export interface GraphNode {
  id: string;
  label: string;
  // 'focus' = the person the graph is centred on; 'person' = everyone else.
  kind: "focus" | "person";
  // Total connection weight to the focus (0 for the focus node itself).
  weight: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  // Human-readable list of why these two are connected.
  reasons: string[];
}

export interface PersonGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focusId: string;
}

// Caps to keep the canvas readable. Beyond MAX_NEIGHBORS we keep the
// top-weighted connections and drop the long tail (logged so it's not a
// silent truncation).
const MAX_NEIGHBORS = 150;

export async function buildPersonGraph(
  focusId: string,
): Promise<PersonGraph | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // All people + their cluster context (tags/passions/circles/cities).
  const contexts = await listPeopleWithContext();
  const focusCtx = contexts.find((c) => c.person.id === focusId);

  // The focus person may be is_self (excluded from listPeopleWithContext)
  // — fetch directly if missing.
  let focus = focusCtx;
  if (!focus) {
    const { data } = await supabase
      .from("people")
      .select("*")
      .eq("id", focusId)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return null;
    focus = {
      person: data,
      tagsByCluster: {},
      tagNotes: {},
      passions: new Set(),
      passionNotes: {},
      circleIds: new Set(),
      circleNotes: {},
      cityList: new Set(),
      contactChannels: new Set(),
    };
  }

  // Explicit relationships from the focus person.
  const { data: relRows } = await supabase
    .from("person_relationships")
    .select("related_person_id, relationship_type, label")
    .eq("person_id", focusId);
  const relByPerson = new Map<string, { type: string; label: string | null }>();
  for (const r of (relRows ?? []) as {
    related_person_id: string;
    relationship_type: string;
    label: string | null;
  }[]) {
    relByPerson.set(r.related_person_id, {
      type: r.relationship_type,
      label: r.label,
    });
  }

  const focusInterests = new Set(
    focus.tagsByCluster.interests?.map((t) => t.toLowerCase()) ?? [],
  );
  const focusOrg = focus.person.organization_id;

  // Score every other person against the focus.
  type Scored = {
    id: string;
    label: string;
    weight: number;
    reasons: string[];
  };
  const scored: Scored[] = [];

  for (const ctx of contexts) {
    if (ctx.person.id === focusId) continue;
    let weight = 0;
    const reasons: string[] = [];

    const rel = relByPerson.get(ctx.person.id);
    if (rel) {
      weight += WEIGHTS.relationship;
      reasons.push(rel.label || rel.type);
    }

    // Shared circles.
    const sharedCircles = [...ctx.circleIds].filter((c) =>
      focus.circleIds.has(c),
    );
    if (sharedCircles.length) {
      weight += WEIGHTS.circle * sharedCircles.length;
      reasons.push(
        `${sharedCircles.length} gemeinsame${sharedCircles.length > 1 ? "" : "r"} Kreis${sharedCircles.length > 1 ? "e" : ""}`,
      );
    }

    // Same organisation.
    if (focusOrg && ctx.person.organization_id === focusOrg) {
      weight += WEIGHTS.organization;
      reasons.push("gleiche Organisation");
    }

    // Shared cities.
    const sharedCities = [...ctx.cityList].filter((c) =>
      focus.cityList.has(c),
    );
    if (sharedCities.length) {
      weight += WEIGHTS.city;
      reasons.push(`gemeinsamer Ort: ${sharedCities[0]}`);
    }

    // Shared passions.
    const sharedPassions = [...ctx.passions].filter((p) =>
      focus.passions.has(p),
    );
    if (sharedPassions.length) {
      weight += WEIGHTS.passion * sharedPassions.length;
      reasons.push(`Passion: ${sharedPassions.slice(0, 3).join(", ")}`);
    }

    // Shared interests (tags/interests cluster).
    const ctxInterests = ctx.tagsByCluster.interests?.map((t) =>
      t.toLowerCase(),
    ) ?? [];
    const sharedInterests = ctxInterests.filter((t) => focusInterests.has(t));
    if (sharedInterests.length) {
      weight += WEIGHTS.interest * sharedInterests.length;
      reasons.push(`Interesse: ${sharedInterests.slice(0, 3).join(", ")}`);
    }

    if (weight > 0) {
      scored.push({
        id: ctx.person.id,
        label: ctx.person.name,
        weight: Math.round(weight * 10) / 10,
        reasons,
      });
    }
  }

  scored.sort((a, b) => b.weight - a.weight);
  const kept = scored.slice(0, MAX_NEIGHBORS);
  if (scored.length > MAX_NEIGHBORS) {
    console.warn(
      `[graph] focus=${focusId} has ${scored.length} connections; showing top ${MAX_NEIGHBORS}.`,
    );
  }

  const nodes: GraphNode[] = [
    { id: focusId, label: focus.person.name, kind: "focus", weight: 0 },
    ...kept.map((s) => ({
      id: s.id,
      label: s.label,
      kind: "person" as const,
      weight: s.weight,
    })),
  ];
  const edges: GraphEdge[] = kept.map((s) => ({
    source: focusId,
    target: s.id,
    weight: s.weight,
    reasons: s.reasons,
  }));

  return { nodes, edges, focusId };
}
