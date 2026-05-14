import { createClient } from "@/lib/supabase/server";
import type { Depth, Person } from "@/lib/types";

// Rank-Mapping fuer Depth-Sort: tieferer Kreis = höherer Rang.
function depthRank(d: Depth | null): number {
  switch (d) {
    case "inner_5":
      return 5;
    case "trusted_15":
      return 4;
    case "active_50":
      return 3;
    case "network_150":
      return 2;
    case "periphery_500":
      return 1;
    default:
      return 0;
  }
}

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

// Buckets each person by how their last_contact_at compares to
// cadence_days. Self-row is excluded.
//
//   on-rhythm  : within 1.0 × cadence
//   due-soon   : 1.0 to 1.5 × cadence
//   drifting   : beyond 1.5 × cadence
//   no-cadence : person has no cadence_days set — skipped
//   no-contact : has cadence but no last_contact_at yet
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
      const cadence = person.cadence_days;
      if (cadence == null) {
        return { person, daysSince: null, bucket: "no-cadence" };
      }
      if (!person.last_contact_at) {
        return { person, daysSince: null, bucket: "no-contact" };
      }
      const daysSince = Math.floor(
        (now - new Date(person.last_contact_at).getTime()) /
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

      // Within drifting + due-soon: deepest relationships surface
      // first — those are the ones whose drift hurts the most.
      // depth: inner_5 = 5, periphery_500 = 1, null = 0 (sinks).
      if (a.bucket === "drifting" || a.bucket === "due-soon") {
        const sa = depthRank(a.person.depth);
        const sb = depthRank(b.person.depth);
        if (sa !== sb) return sb - sa;
      }

      // Tiebreak: more days-since first.
      if (a.daysSince === null && b.daysSince === null) return 0;
      if (a.daysSince === null) return 1;
      if (b.daysSince === null) return -1;
      return b.daysSince - a.daysSince;
    });
}
