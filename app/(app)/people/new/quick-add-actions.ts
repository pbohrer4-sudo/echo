"use server";

// Server Action für Quick-Add (Phase C2, Briefing 5.1).
//
// Schreibt direkt auf people (kein Suggestion-Flow — User legt
// explizit eine Person an). Auto-Resolve für company → organization_id
// wie createPerson das auch tut, damit die Org-Auto-Enrich-Pipeline
// im Hintergrund anspringen kann.
//
// Tags werden hier als comma-separated string aufgenommen, geparsed,
// pro Wert getOrCreateTag (cluster=topic default), dann addTagToPerson.
// User kann später Cluster pro Tag re-klassifizieren via Suggestion-
// Flow oder Tag-UI (Phase C6).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveOrCreateOrganization } from "@/lib/organizations";
import type {
  Depth,
  EmailEntry,
  ImportantDate,
  LocationGeo,
  PhoneEntry,
  Purpose,
  TagCluster,
} from "@/lib/types";

// 0029 — Hidden-Input vom LocationAutocomplete parsen. Untrusted JSON,
// also Schema validieren bevor wir's persistieren. Bei Format-Fehler
// einfach null zurückgeben — der freitext-Wert (sichtbares Input)
// bleibt davon unberührt.
function parseLocationGeo(raw: FormDataEntryValue | null): LocationGeo | null {
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

const PURPOSE_VALUES: Purpose[] = [
  "personal",
  "family",
  "business_active",
  "business_latent",
  "aspirational",
];
const DEPTH_VALUES: Depth[] = [
  "inner_5",
  "trusted_15",
  "active_50",
  "network_150",
  "periphery_500",
];

function trimOrNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function dateOrNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // HTML5 date input gibt "YYYY-MM-DD" — direkt durchreichen.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export async function createPersonQuick(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Einziges Pflichtfeld: Name. Alles andere optional damit Quick-Add
  // wirklich quick ist — Detail-Page erlaubt nachträgliches Ergänzen.
  const name = trimOrNull(formData.get("name"));
  const howWeMet = trimOrNull(formData.get("how_we_met"));
  const purposeRaw = formData.get("purpose");
  const depthRaw = formData.get("depth"); // "auto" oder ein Depth-Wert

  if (!name) {
    redirect(`/people/new?error=${encodeURIComponent("Name fehlt")}`);
  }
  const purpose: Purpose | null =
    typeof purposeRaw === "string" && PURPOSE_VALUES.includes(purposeRaw as Purpose)
      ? (purposeRaw as Purpose)
      : null;

  // Depth: "auto" → null + depth_source='auto', spezifischer Wert →
  // value + depth_source='manual_override'.
  let depth: Depth | null = null;
  let depth_source: "auto" | "manual_override" = "auto";
  if (typeof depthRaw === "string" && depthRaw !== "auto") {
    if (DEPTH_VALUES.includes(depthRaw as Depth)) {
      depth = depthRaw as Depth;
      depth_source = "manual_override";
    }
  }

  // — Advanced-Toggle-Felder —
  const company = trimOrNull(formData.get("company"));
  const role = trimOrNull(formData.get("role"));
  const phoneValue = trimOrNull(formData.get("phone"));
  const emailValue = trimOrNull(formData.get("email"));
  const linkedinValue = trimOrNull(formData.get("linkedin_url"));
  const websiteValue = trimOrNull(formData.get("website"));
  const notes = trimOrNull(formData.get("notes"));
  const birthday = dateOrNull(formData.get("birthday"));
  const photoUrl = trimOrNull(formData.get("photo_url"));
  const metDate = dateOrNull(formData.get("met_date"));
  const metLocation = trimOrNull(formData.get("met_location"));
  const metLocationGeo = parseLocationGeo(formData.get("met_location_geo"));
  const currentLocation = trimOrNull(formData.get("current_location"));
  const currentLocationGeo = parseLocationGeo(
    formData.get("current_location_geo"),
  );
  const homeLocation = trimOrNull(formData.get("home_location"));
  const homeLocationGeo = parseLocationGeo(formData.get("home_location_geo"));

  // Geburtstag → important_dates JSONB-Array.
  const importantDates: ImportantDate[] = [];
  if (birthday) {
    importantDates.push({ label: "Geburtstag", date: birthday, remind: true });
  }

  // Phone/Email als JSONB-Single-Entry-Array (Echo-Format).
  const phones: PhoneEntry[] = phoneValue
    ? [{ label: "mobile", value: phoneValue }]
    : [];
  const emails: EmailEntry[] = emailValue
    ? [{ label: "persönlich", value: emailValue }]
    : [];

  // Org-Resolution: wenn company gesetzt, Org anlegen oder finden.
  const organization_id = company
    ? await resolveOrCreateOrganization(company, user.id)
    : null;

  // Insert. Legacy-Felder (scope, etc.) werden NICHT gesetzt — die
  // DB-Defaults greifen (scope kriegt 'both' von der alten Constraint,
  // weil wir scope in 0023 NICHT gedroppt haben, parallel-lauf).
  const { data: newPerson, error: insertError } = await supabase
    .from("people")
    .insert({
      user_id: user.id,
      name,
      company,
      role,
      organization_id,
      phones,
      emails,
      addresses: [],
      socials: websiteValue
        ? [{ platform: "Website", handle_or_url: websiteValue }]
        : [],
      important_dates: importantDates,
      relationships: [],
      notes,
      linkedin_url: linkedinValue,
      photo_url: photoUrl,
      // Briefing-v3-Schema (Legacy-Spalten weg seit 0025).
      how_we_met: howWeMet,
      met_date: metDate,
      met_location: metLocation,
      met_location_geo: metLocationGeo,
      current_location: currentLocation,
      current_location_geo: currentLocationGeo,
      home_location: homeLocation,
      home_location_geo: homeLocationGeo,
      purpose,
      depth,
      depth_source,
      // mode default 'active' via DB
    })
    .select("id")
    .single();

  if (insertError || !newPerson) {
    redirect(
      `/people/new?error=${encodeURIComponent(insertError?.message ?? "Insert failed")}`,
    );
  }

  // V3-Tabellen parallel füttern (0030 Phase 3). Failures hier blocken
  // den Person-Create nicht — JSONB-Felder oben sind in der
  // Transition noch der Fallback.
  if (phoneValue) {
    await supabase.from("person_contacts").insert({
      user_id: user.id,
      person_id: newPerson.id,
      channel: "phone",
      subtype: "mobile",
      value: phoneValue,
      is_primary: true,
      source: "manual",
    });
  }
  if (emailValue) {
    await supabase.from("person_contacts").insert({
      user_id: user.id,
      person_id: newPerson.id,
      channel: "email",
      subtype: "persönlich",
      value: emailValue,
      is_primary: true,
      source: "manual",
    });
  }
  if (linkedinValue) {
    await supabase.from("person_contacts").insert({
      user_id: user.id,
      person_id: newPerson.id,
      channel: "linkedin",
      value: linkedinValue,
      is_primary: true,
      source: "manual",
    });
  }
  if (websiteValue) {
    await supabase.from("person_contacts").insert({
      user_id: user.id,
      person_id: newPerson.id,
      channel: "website",
      value: websiteValue,
      is_primary: true,
      source: "manual",
    });
  }
  // Locations → person_geographies (residence/origin/met_location).
  // Strukturierte Daten wenn geo gesetzt, sonst nur display_name.
  type GeoInsert = {
    geo_type: "residence" | "origin" | "met_location";
    display_name: string;
    latitude: number | null;
    longitude: number | null;
    place_id: string | null;
  };
  const geoInserts: GeoInsert[] = [];
  if (currentLocation) {
    geoInserts.push({
      geo_type: "residence",
      display_name: currentLocationGeo?.display_name ?? currentLocation,
      latitude: currentLocationGeo?.lat ?? null,
      longitude: currentLocationGeo?.lng ?? null,
      place_id: currentLocationGeo?.place_id ?? null,
    });
  }
  if (homeLocation) {
    geoInserts.push({
      geo_type: "origin",
      display_name: homeLocationGeo?.display_name ?? homeLocation,
      latitude: homeLocationGeo?.lat ?? null,
      longitude: homeLocationGeo?.lng ?? null,
      place_id: homeLocationGeo?.place_id ?? null,
    });
  }
  if (metLocation) {
    geoInserts.push({
      geo_type: "met_location",
      display_name: metLocationGeo?.display_name ?? metLocation,
      latitude: metLocationGeo?.lat ?? null,
      longitude: metLocationGeo?.lng ?? null,
      place_id: metLocationGeo?.place_id ?? null,
    });
  }
  if (geoInserts.length > 0) {
    await supabase.from("person_geographies").insert(
      geoInserts.map((g) => ({
        user_id: user.id,
        person_id: newPerson.id,
        is_active: true,
        ...g,
      })),
    );
  }

  // Cluster-State aus dem Form-Hidden-Input: Tags pro Cluster +
  // Passions + Circles. Failures hier blocken den Person-Create
  // nicht — alles best-effort.
  const cluster = parseClusterState(formData.get("cluster_state"));

  // Tags: pro Cluster, getOrCreateTag + addTagToPerson.
  const tagClusterEntries = Object.entries(cluster.tags) as Array<
    [TagCluster, string[]]
  >;
  for (const [tagCluster, tagNames] of tagClusterEntries) {
    for (const rawName of tagNames) {
      const name = rawName.trim().toLowerCase();
      if (!name) continue;
      const { data: existingTag } = await supabase
        .from("tags")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", name)
        .maybeSingle();
      let tagId = existingTag?.id ?? null;
      if (!tagId) {
        const { data: inserted } = await supabase
          .from("tags")
          .insert({
            user_id: user.id,
            name,
            cluster: tagCluster,
            created_by: "user",
          })
          .select("id")
          .single();
        tagId = inserted?.id ?? null;
      }
      if (tagId) {
        await supabase
          .from("person_tags")
          .insert({ person_id: newPerson.id, tag_id: tagId });
      }
    }
  }

  // Passions: einfach pro Eintrag eine Row in passions.
  for (const passion of cluster.passions) {
    const trimmed = passion.trim();
    if (!trimmed) continue;
    await supabase.from("passions").insert({
      user_id: user.id,
      person_id: newPerson.id,
      name: trimmed,
    });
  }

  // Circles: getOrCreateCircle + addPersonToCircle. resolveOrCreate ist
  // race-safe gegenüber Unique-Constraint.
  for (const circleName of cluster.circles) {
    const trimmed = circleName.trim();
    if (!trimmed) continue;
    const { data: existingCircle } = await supabase
      .from("circles")
      .select("id")
      .eq("user_id", user.id)
      .ilike("name", trimmed)
      .maybeSingle();
    let circleId = existingCircle?.id ?? null;
    if (!circleId) {
      const { data: inserted } = await supabase
        .from("circles")
        .insert({ user_id: user.id, name: trimmed })
        .select("id")
        .single();
      circleId = inserted?.id ?? null;
    }
    if (circleId) {
      await supabase
        .from("person_circles")
        .insert({ person_id: newPerson.id, circle_id: circleId });
    }
  }

  revalidatePath("/people");
  redirect(`/people/${newPerson.id}`);
}

// 0030 — Cluster-Hidden-Input vom Quick-Add-Form parsen. Defensive
// Validierung: nur bekannte TagCluster-Werte landen in der Map,
// Arrays werden auf String-Items normalisiert.
interface ParsedCluster {
  tags: Record<TagCluster, string[]>;
  passions: string[];
  circles: string[];
}
const VALID_CLUSTERS: TagCluster[] = [
  "reminders",
  "interests",
  "potential",
  "origin",
];
function parseClusterState(raw: FormDataEntryValue | null): ParsedCluster {
  const empty: ParsedCluster = {
    tags: { reminders: [], interests: [], potential: [], origin: [] },
    passions: [],
    circles: [],
  };
  if (typeof raw !== "string" || !raw.trim()) return empty;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const tagsRaw = (parsed.tags ?? {}) as Record<string, unknown>;
    for (const c of VALID_CLUSTERS) {
      const arr = tagsRaw[c];
      if (Array.isArray(arr)) {
        empty.tags[c] = arr.filter((x): x is string => typeof x === "string");
      }
    }
    if (Array.isArray(parsed.passions)) {
      empty.passions = parsed.passions.filter(
        (x): x is string => typeof x === "string",
      );
    }
    if (Array.isArray(parsed.circles)) {
      empty.circles = parsed.circles.filter(
        (x): x is string => typeof x === "string",
      );
    }
  } catch {
    // ignore — leerer Cluster-State falls JSON kaputt war
  }
  return empty;
}
