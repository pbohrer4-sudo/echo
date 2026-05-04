import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";

export type CadenceBucket =
  | "on-rhythm"
  | "due-soon"
  | "drifting"
  | "no-cadence"
  | "no-contact";

export interface CadenceRow {
  person: Person;
  daysSince: number | null;
  bucket: CadenceBucket;
}

// Buckets each person by how their last_interaction_at compares to
// expected_cadence_days. Self-row is excluded.
//
//   on-rhythm  : within 1.0 × cadence
//   due-soon   : 1.0 to 1.5 × cadence
//   drifting   : beyond 1.5 × cadence
//   no-cadence : person has no expected_cadence_days set — skipped
//   no-contact : has cadence but no last_interaction_at yet
export async function listCadenceRows(): Promise<CadenceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .is("deleted_at", null)
    .eq("is_self", false);
  if (error) throw error;

  const now = Date.now();
  return (data as Person[])
    .map<CadenceRow>((person) => {
      const cadence = person.expected_cadence_days;
      if (cadence == null) {
        return { person, daysSince: null, bucket: "no-cadence" };
      }
      if (!person.last_interaction_at) {
        return { person, daysSince: null, bucket: "no-contact" };
      }
      const daysSince = Math.floor(
        (now - new Date(person.last_interaction_at).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      let bucket: CadenceBucket;
      if (daysSince <= cadence) bucket = "on-rhythm";
      else if (daysSince <= cadence * 1.5) bucket = "due-soon";
      else bucket = "drifting";
      return { person, daysSince, bucket };
    })
    .sort((a, b) => {
      // Drifting first (most attention needed), then due-soon, then
      // on-rhythm, then no-contact, then no-cadence.
      const order: Record<CadenceBucket, number> = {
        drifting: 0,
        "due-soon": 1,
        "on-rhythm": 2,
        "no-contact": 3,
        "no-cadence": 4,
      };
      const o = order[a.bucket] - order[b.bucket];
      if (o !== 0) return o;

      // Within drifting + due-soon: high-strength relationships
      // surface first — those are the ones whose drift hurts the
      // most. Unrated (0) sinks to the bottom of the bucket.
      if (a.bucket === "drifting" || a.bucket === "due-soon") {
        const sa = a.person.strength_score ?? 0;
        const sb = b.person.strength_score ?? 0;
        if (sa !== sb) return sb - sa;
      }

      // Tiebreak: more days-since first.
      if (a.daysSince === null && b.daysSince === null) return 0;
      if (a.daysSince === null) return 1;
      if (b.daysSince === null) return -1;
      return b.daysSince - a.daysSince;
    });
}
