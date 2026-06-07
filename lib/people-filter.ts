// Shared filter-spec für die People-Liste.
//
// Lebt sowohl in der UI (people-table.tsx liest/setzt URL-Params) als
// auch in lib/tools.ts (Voice-Tool query_people produziert dasselbe
// Shape). Eine einzige Source-of-Truth für die Filter-Logik.

import { MODE_VALUES } from "@/lib/types";
import type { Depth, Mode, Purpose, TagCluster } from "@/lib/types";

export type ChannelFilter = "has_phone" | "has_email" | "has_linkedin";

export interface PeopleFilterSpec {
  q?: string;                  // Freitext
  mode?: Mode;
  purpose?: Purpose;
  depth?: Depth;
  cluster?: TagCluster;        // mindestens ein Tag in diesem Cluster
  tag?: string;                // exakter Tag-Name (case-insensitive)
  passion?: string;            // lower-case-Match
  synergy?: string;            // synergy_tag, lower-case-Match
  circle?: string;             // circle_id ODER name-substring
  location?: string;           // city-substring, lower-cased
  channel?: ChannelFilter;
  // "yes" → nur Personen mit gift_idea, "no" → nur ohne. case-insensitive
  // string-Match unterstützen wir bewusst nicht (zu viel Streuung im
  // Freitext); wer das braucht nutzt q.
  gifts?: "yes" | "no";
}

const VALID_MODES = new Set<Mode>(MODE_VALUES);
const VALID_PURPOSES = new Set<Purpose>([
  "personal",
  "family",
  "business_active",
  "business_latent",
  "aspirational",
]);
const VALID_DEPTHS = new Set<Depth>([
  "inner_5",
  "trusted_15",
  "active_50",
  "network_150",
  "periphery_500",
]);
const VALID_CLUSTERS = new Set<TagCluster>([
  "reminders",
  "interests",
  "potential",
  "origin",
]);
const VALID_CHANNELS = new Set<ChannelFilter>([
  "has_phone",
  "has_email",
  "has_linkedin",
]);

// URL-Params → typisierter Spec. Unbekannte Werte werden verworfen,
// damit URL-Manipulation nicht die UI in undefined-State drückt.
export function parseFilterFromParams(
  params: URLSearchParams | Record<string, string | undefined>,
): PeopleFilterSpec {
  const get = (k: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(k) ?? undefined;
    return params[k];
  };
  const out: PeopleFilterSpec = {};
  const q = get("q");
  if (q && q.trim()) out.q = q.trim();
  const mode = get("mode");
  if (mode && VALID_MODES.has(mode as Mode)) out.mode = mode as Mode;
  const purpose = get("purpose");
  if (purpose && VALID_PURPOSES.has(purpose as Purpose))
    out.purpose = purpose as Purpose;
  const depth = get("depth");
  if (depth && VALID_DEPTHS.has(depth as Depth)) out.depth = depth as Depth;
  const cluster = get("cluster");
  if (cluster && VALID_CLUSTERS.has(cluster as TagCluster))
    out.cluster = cluster as TagCluster;
  const tag = get("tag");
  if (tag && tag.trim()) out.tag = tag.trim().toLowerCase();
  const passion = get("passion");
  if (passion && passion.trim()) out.passion = passion.trim().toLowerCase();
  const synergy = get("synergy");
  if (synergy && synergy.trim()) out.synergy = synergy.trim().toLowerCase();
  const circle = get("circle");
  if (circle && circle.trim()) out.circle = circle.trim();
  const location = get("location");
  if (location && location.trim()) out.location = location.trim().toLowerCase();
  const channel = get("channel");
  if (channel && VALID_CHANNELS.has(channel as ChannelFilter))
    out.channel = channel as ChannelFilter;
  const gifts = get("gifts");
  if (gifts === "yes" || gifts === "no") out.gifts = gifts;
  return out;
}

// Spec → URL-Param-String (für Link/Navigation). Leere Felder fallen raus.
export function serializeFilterToParams(spec: PeopleFilterSpec): URLSearchParams {
  const p = new URLSearchParams();
  if (spec.q) p.set("q", spec.q);
  if (spec.mode) p.set("mode", spec.mode);
  if (spec.purpose) p.set("purpose", spec.purpose);
  if (spec.depth) p.set("depth", spec.depth);
  if (spec.cluster) p.set("cluster", spec.cluster);
  if (spec.tag) p.set("tag", spec.tag);
  if (spec.passion) p.set("passion", spec.passion);
  if (spec.synergy) p.set("synergy", spec.synergy);
  if (spec.circle) p.set("circle", spec.circle);
  if (spec.location) p.set("location", spec.location);
  if (spec.channel) p.set("channel", spec.channel);
  if (spec.gifts) p.set("gifts", spec.gifts);
  return p;
}

export function isEmptyFilter(spec: PeopleFilterSpec): boolean {
  return Object.keys(spec).length === 0;
}
