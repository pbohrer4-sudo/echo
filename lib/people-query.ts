// Server-side Executor für das query_people Voice-Tool.
//
// Liest die existierenden People-Daten (inkl. Tags/Passions/Circles)
// via listPeopleWithContext und filtert clientseitig — identische Logik
// wie people-table.tsx, damit Voice-Resultat und UI deckungsgleich sind.

import { listPeopleWithContext } from "@/lib/people";
import { listAllCircles } from "@/lib/circles";
import type { PeopleFilterSpec } from "@/lib/people-filter";

export interface QueryPeopleResult {
  count: number;
  sample: string[];           // erste N Namen
  total_people: number;       // wie viele es ohne Filter gäbe
  filter_summary: string;     // menschlich-lesbare Zusammenfassung der Filter
}

const SAMPLE_SIZE = 5;

export async function executeQueryPeople(
  spec: PeopleFilterSpec,
): Promise<QueryPeopleResult> {
  const [rows, circles] = await Promise.all([
    listPeopleWithContext(),
    listAllCircles(),
  ]);

  // Circle-Match: spec.circle kann UUID, Name oder Substring sein.
  let circleIdFilter: string | null = null;
  if (spec.circle) {
    const v = spec.circle;
    if (/^[0-9a-f-]{36}$/i.test(v)) {
      circleIdFilter = circles.find((c) => c.id === v)?.id ?? null;
    } else {
      const lower = v.toLowerCase();
      circleIdFilter =
        circles.find((c) => c.name.toLowerCase().includes(lower))?.id ?? null;
    }
  }

  const q = spec.q?.trim().toLowerCase() ?? "";
  const locationLower = spec.location?.toLowerCase() ?? "";

  const matched = rows.filter((r) => {
    const p = r.person;
    if (spec.mode && p.mode !== spec.mode) return false;
    if (spec.purpose && p.purpose !== spec.purpose) return false;
    if (spec.depth && p.depth !== spec.depth) return false;
    if (spec.cluster && !Object.keys(r.tagsByCluster).includes(spec.cluster))
      return false;
    if (spec.tag) {
      const wanted = spec.tag.toLowerCase();
      const allTagNames = Object.values(r.tagsByCluster).flat();
      if (!allTagNames.some((n) => n.toLowerCase() === wanted)) return false;
    }
    if (spec.passion) {
      const wanted = spec.passion.toLowerCase();
      if (!r.passions.has(wanted)) return false;
    }
    if (spec.circle) {
      if (!circleIdFilter) return false;
      if (!r.circleIds.has(circleIdFilter)) return false;
    }
    if (locationLower) {
      // V3 person_geographies (indexed) + Legacy-Fallback
      const v3 = Array.from(r.cityList).some((c) =>
        c.includes(locationLower),
      );
      const legacy = [
        p.current_location?.toLowerCase(),
        p.home_location?.toLowerCase(),
        p.met_location?.toLowerCase(),
      ]
        .filter((x): x is string => Boolean(x))
        .some((c) => c.includes(locationLower));
      if (!v3 && !legacy) return false;
    }
    if (spec.channel === "has_phone") {
      const v3 = Array.from(r.contactChannels).some(
        (c) => c === "phone" || c === "whatsapp",
      );
      const legacy = (p.phones?.length ?? 0) > 0;
      if (!v3 && !legacy) return false;
    }
    if (spec.channel === "has_email") {
      const v3 = r.contactChannels.has("email");
      const legacy = (p.emails?.length ?? 0) > 0;
      if (!v3 && !legacy) return false;
    }
    if (spec.channel === "has_linkedin") {
      const v3 = r.contactChannels.has("linkedin");
      const legacy = Boolean(p.linkedin_url);
      if (!v3 && !legacy) return false;
    }
    if (spec.gifts === "yes" && !p.gift_idea) return false;
    if (spec.gifts === "no" && p.gift_idea) return false;

    if (q) {
      const tagNames = Object.values(r.tagsByCluster).flat();
      const circleNames = Array.from(r.circleIds)
        .map((id) => circles.find((c) => c.id === id)?.name ?? "")
        .filter(Boolean);
      const haystack = [
        p.name,
        p.company,
        p.role,
        p.notes,
        p.gift_idea,
        p.how_we_met,
        p.met_location,
        p.current_location,
        p.home_location,
        ...tagNames,
        ...Array.from(r.passions),
        ...circleNames,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const sample = matched.slice(0, SAMPLE_SIZE).map((r) => r.person.name);

  return {
    count: matched.length,
    sample,
    total_people: rows.length,
    filter_summary: summarizeFilter(spec),
  };
}

// Menschlich-lesbare Zusammenfassung der Filter für das Tool-Result —
// hilft Claude in der Folge-Antwort konkret zu sein („47 in München mit
// Padel" statt „47 Treffer").
function summarizeFilter(spec: PeopleFilterSpec): string {
  const parts: string[] = [];
  if (spec.q) parts.push(`Freitext „${spec.q}"`);
  if (spec.mode) parts.push(`Modus ${spec.mode}`);
  if (spec.purpose) parts.push(`Zweck ${spec.purpose}`);
  if (spec.depth) parts.push(`Tiefe ${spec.depth}`);
  if (spec.cluster) parts.push(`Cluster ${spec.cluster}`);
  if (spec.passion) parts.push(`Passion ${spec.passion}`);
  if (spec.circle) parts.push(`Circle ${spec.circle}`);
  if (spec.location) parts.push(`Ort ${spec.location}`);
  if (spec.channel) parts.push(`Kanal ${spec.channel}`);
  return parts.length > 0 ? parts.join(" + ") : "keine Filter";
}
