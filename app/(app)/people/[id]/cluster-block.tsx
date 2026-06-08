// Server-Component für den Tag/Passion/Circle-Block auf Person-Detail
// (Phase C6, Briefing v3 #19, 0028 Notes). Fetched alle Datasets parallel
// inkl. der per-Person-Notes auf den Junction-Tabellen.

import { listTagsWithNotesForPerson, listAllTags } from "@/lib/tags";
import { listPassionsForPerson, listAllPassionNames } from "@/lib/passions";
import {
  listAllCircles,
  listCirclesWithNotesForPerson,
} from "@/lib/circles";
import { getPersonById } from "@/lib/people";
import { ClusterEditor } from "@/components/cluster-editor";
import type { TagCluster } from "@/lib/types";

export async function ClusterBlock({ personId }: { personId: string }) {
  const [person, tags, passions, personCircles, allCircles, allTags, allPassionNames] =
    await Promise.all([
      getPersonById(personId),
      listTagsWithNotesForPerson(personId),
      listPassionsForPerson(personId),
      listCirclesWithNotesForPerson(personId),
      listAllCircles(),
      listAllTags(),
      listAllPassionNames(),
    ]);

  // Distinct tag-name suggestions grouped by cluster (same-category
  // autocomplete: a passion suggests passions, an interests tag suggests
  // interests, never across clusters).
  const tagSuggestions: Record<string, string[]> = {};
  const seen: Record<string, Set<string>> = {};
  for (const t of allTags) {
    const c = t.cluster as TagCluster;
    if (!tagSuggestions[c]) {
      tagSuggestions[c] = [];
      seen[c] = new Set();
    }
    const key = t.name.toLowerCase();
    if (seen[c].has(key)) continue;
    seen[c].add(key);
    tagSuggestions[c].push(t.name);
  }

  return (
    <ClusterEditor
      personId={personId}
      personName={person?.name ?? ""}
      tags={tags}
      passions={passions}
      personCircles={personCircles}
      allCircles={allCircles}
      tagSuggestions={tagSuggestions}
      passionSuggestions={allPassionNames}
    />
  );
}
