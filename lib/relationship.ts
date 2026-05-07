// Phase 2 — pure computed values for the relationship dimensions
// the user doesn't have to maintain manually. Everything here works
// from existing fields (last_interaction_at, created_at, override
// columns) so we don't need a nightly job to keep them fresh.

import type {
  Person,
  PriorityBucket,
  PriorityLetter,
  RelationshipDepth,
  RelationshipWarmth,
} from "@/lib/types";

const DAY = 1000 * 60 * 60 * 24;

// Beziehungswärme — pure function of the time since last interaction.
//   < 30 days  → Aktiv
//   < 90 days  → Warm
//   < 180 days → Kühl
//   else       → Kalt (also for "never interacted")
export function computeWarmth(
  lastInteractionAt: string | null,
): RelationshipWarmth {
  if (!lastInteractionAt) return "Kalt";
  const last = new Date(lastInteractionAt).getTime();
  if (Number.isNaN(last)) return "Kalt";
  const days = (Date.now() - last) / DAY;
  if (days < 30) return "Aktiv";
  if (days < 90) return "Warm";
  if (days < 180) return "Kühl";
  return "Kalt";
}

// Beziehungstiefe — derived from interaction count + how long ago we
// first met them. Manual override always wins. Without interaction
// history we use person.created_at as a proxy for first contact.
//
//   override            → use it
//   0 interactions      → Fremd
//   1-3 interactions    → Bekannt
//   > 3 OR > 6 months   → Vertraut
//   > 15 AND > 12 months→ Persönlich
export function computeDepth({
  interactionCount,
  firstSeenAt,
  override,
}: {
  interactionCount: number;
  firstSeenAt: string | null;
  override: RelationshipDepth | null;
}): RelationshipDepth {
  if (override) return override;
  if (interactionCount <= 0) return "Fremd";
  if (interactionCount <= 3) return "Bekannt";

  const monthsSpan = firstSeenAt
    ? (Date.now() - new Date(firstSeenAt).getTime()) / (DAY * 30)
    : 0;

  if (interactionCount > 15 && monthsSpan > 12) return "Persönlich";
  if (interactionCount > 3 || monthsSpan > 6) return "Vertraut";
  return "Bekannt";
}

// Priorität-Decay — buckets walk forward as time passes since the
// user last touched them. We display the decayed bucket without
// writing it back; the next save will persist it.
export function decayedPriorityBucket(
  bucket: PriorityBucket | null,
  setAt: string | null,
): PriorityBucket | null {
  if (!bucket) return null;
  if (!setAt) return bucket;
  const days = (Date.now() - new Date(setAt).getTime()) / DAY;
  if (Number.isNaN(days)) return bucket;
  if (bucket === "this-week" && days > 7) return "next-week";
  if (bucket === "next-week" && days > 14) return "later";
  return bucket;
}

// Convenience for header rendering — pulls everything from a Person
// row plus a precomputed interaction count.
export function relationshipSnapshot(
  person: Person,
  interactionCount: number,
): {
  warmth: RelationshipWarmth;
  depth: RelationshipDepth;
  priority: PriorityLetter | null;
  priorityBucket: PriorityBucket | null;
  priorityDecayed: boolean;
  ctaActive: boolean;
} {
  const warmth = computeWarmth(person.last_interaction_at);
  const depth = computeDepth({
    interactionCount,
    firstSeenAt: person.created_at,
    override: person.depth_override,
  });
  const decayed = decayedPriorityBucket(
    person.priority_bucket,
    person.priority_set_at,
  );
  const ctaActive =
    !!person.cta &&
    (!person.cta_expires_at ||
      new Date(person.cta_expires_at).getTime() > Date.now());

  return {
    warmth,
    depth,
    priority: person.priority,
    priorityBucket: decayed,
    priorityDecayed: decayed !== person.priority_bucket,
    ctaActive,
  };
}

// Display tones (used by both the header chip and any future filter UI).
export const WARMTH_TONE: Record<
  RelationshipWarmth,
  { dot: string; chipBg: string; chipBorder: string; text: string }
> = {
  Aktiv: {
    dot: "oklch(58% 0.10 145)",
    chipBg: "oklch(94% 0.04 145)",
    chipBorder: "oklch(58% 0.10 145)",
    text: "oklch(34% 0.06 145)",
  },
  Warm: {
    dot: "oklch(72% 0.13 75)",
    chipBg: "oklch(96% 0.04 80)",
    chipBorder: "oklch(72% 0.13 75)",
    text: "oklch(40% 0.10 75)",
  },
  Kühl: {
    dot: "oklch(60% 0.05 250)",
    chipBg: "oklch(95% 0.012 250)",
    chipBorder: "oklch(60% 0.05 250)",
    text: "oklch(32% 0.04 250)",
  },
  Kalt: {
    dot: "var(--ink-4)",
    chipBg: "var(--paper-2)",
    chipBorder: "var(--rule)",
    text: "var(--ink-3)",
  },
};
