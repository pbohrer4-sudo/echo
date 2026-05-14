// Geteilter Parser für das hidden _geo-FormData-Feld vom
// LocationAutocomplete. Untrusted JSON — wird strikt validiert
// bevor es in die DB wandert.

import type { LocationGeo } from "@/lib/types";

export type LocationGeoInput = LocationGeo;

export function parseLocationGeo(
  raw: FormDataEntryValue | null,
): LocationGeo | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.display_name === "string" &&
      typeof parsed.lat === "number" &&
      typeof parsed.lng === "number" &&
      typeof parsed.place_id === "string"
    ) {
      return {
        display_name: parsed.display_name,
        lat: parsed.lat,
        lng: parsed.lng,
        place_id: parsed.place_id,
        osm_type:
          typeof parsed.osm_type === "string" ? parsed.osm_type : undefined,
        osm_id: typeof parsed.osm_id === "string" ? parsed.osm_id : undefined,
      };
    }
  } catch {
    // ignore malformed JSON
  }
  return null;
}
