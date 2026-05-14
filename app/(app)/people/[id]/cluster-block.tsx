// Server-Component für den Tag/Passion/Circle-Block auf Person-Detail
// (Phase C6, Briefing v3 #19, 0028 Notes). Fetched alle Datasets parallel
// inkl. der per-Person-Notes auf den Junction-Tabellen.

import { listTagsWithNotesForPerson } from "@/lib/tags";
import { listPassionsForPerson } from "@/lib/passions";
import {
  listAllCircles,
  listCirclesWithNotesForPerson,
} from "@/lib/circles";
import { getPersonById } from "@/lib/people";
import { ClusterEditor } from "@/components/cluster-editor";

export async function ClusterBlock({ personId }: { personId: string }) {
  const [person, tags, passions, personCircles, allCircles] = await Promise.all([
    getPersonById(personId),
    listTagsWithNotesForPerson(personId),
    listPassionsForPerson(personId),
    listCirclesWithNotesForPerson(personId),
    listAllCircles(),
  ]);

  return (
    <ClusterEditor
      personId={personId}
      personName={person?.name ?? ""}
      tags={tags}
      passions={passions}
      personCircles={personCircles}
      allCircles={allCircles}
    />
  );
}
