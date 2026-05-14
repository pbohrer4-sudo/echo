// Helper-Funktionen für person_geographies (V3-Schema, Migration 0030).
//
// Mehrere Geo-Einträge pro Person mit Historie (is_active). In Phase 2
// ersetzt das die freitext-Spalten current_/home_/met_location auf
// people.

import { createClient } from "@/lib/supabase/server";
import type {
  GeoPrecision,
  GeoType,
  LocationGeo,
  PersonGeography,
} from "@/lib/types";

export async function listGeographiesForPerson(
  personId: string,
  options: { includeInactive?: boolean } = {},
): Promise<PersonGeography[]> {
  const supabase = await createClient();
  let q = supabase
    .from("person_geographies")
    .select("*")
    .eq("person_id", personId);
  if (!options.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) {
    console.error("[geographies] list failed", error);
    return [];
  }
  return (data ?? []) as PersonGeography[];
}

export interface CreateGeographyInput {
  person_id: string;
  geo_type: GeoType;
  display_name: string;
  custom_label?: string | null;
  is_active?: boolean;
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  place_id?: string | null;
  precision?: GeoPrecision | null;
}

export async function createGeography(
  input: CreateGeographyInput,
): Promise<PersonGeography | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("person_geographies")
    .insert({
      user_id: user.id,
      person_id: input.person_id,
      geo_type: input.geo_type,
      custom_label: input.custom_label ?? null,
      is_active: input.is_active ?? true,
      display_name: input.display_name.trim(),
      street: input.street ?? null,
      postal_code: input.postal_code ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      country: input.country ?? null,
      country_code: input.country_code ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      place_id: input.place_id ?? null,
      precision: input.precision ?? null,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[geographies] create failed", error);
    return null;
  }
  return data as PersonGeography;
}

/**
 * Convenience-Variante die ein LocationGeo (aus dem OSM-Autocomplete
 * resultat) entgegennimmt und in eine person_geographies-Row schreibt.
 */
export async function createGeographyFromLocationGeo(
  personId: string,
  geoType: GeoType,
  geo: LocationGeo,
): Promise<PersonGeography | null> {
  return createGeography({
    person_id: personId,
    geo_type: geoType,
    display_name: geo.display_name,
    latitude: geo.lat,
    longitude: geo.lng,
    place_id: geo.place_id,
  });
}

export async function updateGeography(
  id: string,
  patch: Partial<PersonGeography>,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("person_geographies")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[geographies] update failed", error);
    return false;
  }
  return true;
}

export async function deleteGeography(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("person_geographies")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("[geographies] delete failed", error);
    return false;
  }
  return true;
}

/**
 * Toggle is_active — wird genutzt um historische Wohnorte als
 * inactive zu markieren ohne sie zu löschen.
 */
export async function setGeographyActive(
  id: string,
  isActive: boolean,
): Promise<boolean> {
  return updateGeography(id, { is_active: isActive });
}

/**
 * Personen-Suche per Geographie. In Phase 2 lösen wir damit
 * „Personen in München" mit einem indexed query ab — heute substring
 * auf people.current_location.
 */
export async function listPeopleInCity(
  city: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("person_geographies")
    .select("person_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .ilike("city", `%${city}%`);
  if (error) {
    console.error("[geographies] listPeopleInCity failed", error);
    return [];
  }
  return Array.from(new Set((data ?? []).map((r) => r.person_id as string)));
}
