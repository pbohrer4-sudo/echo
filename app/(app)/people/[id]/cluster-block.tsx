// Server-Component für den Tag/Passion/Circle-Block auf Person-Detail
// (Phase C6, Briefing v3 #19). Fetched alle drei Datasets parallel und
// reicht sie an die Client-Editor-Component weiter.

import { listTagsForPerson } from "@/lib/tags";
import { listPassionsForPerson } from "@/lib/passions";
import { listAllCircles, listCirclesForPerson } from "@/lib/circles";
import { ClusterEditor } from "@/components/cluster-editor";

export async function ClusterBlock({ personId }: { personId: string }) {
  const [tags, passions, personCircles, allCircles] = await Promise.all([
    listTagsForPerson(personId),
    listPassionsForPerson(personId),
    listCirclesForPerson(personId),
    listAllCircles(),
  ]);

  return (
    <ClusterEditor
      personId={personId}
      tags={tags}
      passions={passions}
      personCircles={personCircles}
      allCircles={allCircles}
    />
  );
}
