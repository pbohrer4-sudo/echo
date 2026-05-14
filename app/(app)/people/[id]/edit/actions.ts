"use server";

// Server-Action für die schlanke Edit-Form auf /people/[id]/edit.
// Updated nur scalar Felder auf der people-Tabelle — Arrays/JSONB
// (phones/emails/relationships/etc.) werden direkt auf der Detail-
// Page via inline-Forms gepflegt, nicht hier.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveOrCreateOrganization } from "@/lib/organizations";
import { parseLocationGeo, type LocationGeoInput } from "@/lib/location-geo-parse";

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function dateOrNull(v: FormDataEntryValue | null): string | null {
  const t = trimOrNull(v);
  if (!t) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export async function updatePerson(personId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = trimOrNull(formData.get("name"));
  if (!name) {
    redirect(
      `/people/${personId}/edit?error=${encodeURIComponent("Name fehlt")}`,
    );
  }

  const company = trimOrNull(formData.get("company"));
  const role = trimOrNull(formData.get("role"));
  const notes = trimOrNull(formData.get("notes"));
  const photoUrl = trimOrNull(formData.get("photo_url"));
  const linkedinUrl = trimOrNull(formData.get("linkedin_url"));
  const howWeMet = trimOrNull(formData.get("how_we_met"));
  const metDate = dateOrNull(formData.get("met_date"));
  const metLocation = trimOrNull(formData.get("met_location"));
  const metLocationGeo: LocationGeoInput | null = parseLocationGeo(
    formData.get("met_location_geo"),
  );
  const currentLocation = trimOrNull(formData.get("current_location"));
  const currentLocationGeo: LocationGeoInput | null = parseLocationGeo(
    formData.get("current_location_geo"),
  );
  const homeLocation = trimOrNull(formData.get("home_location"));
  const homeLocationGeo: LocationGeoInput | null = parseLocationGeo(
    formData.get("home_location_geo"),
  );

  // Org-Auflösung: wenn company-String sich geändert hat, organization_id
  // neu setzen. resolveOrCreateOrganization findet existierende oder
  // legt eine neue an.
  const organization_id = await resolveOrCreateOrganization(company, user.id);

  const update: Record<string, unknown> = {
    name,
    company,
    organization_id,
    role,
    notes,
    photo_url: photoUrl,
    linkedin_url: linkedinUrl,
    how_we_met: howWeMet,
    met_date: metDate,
    met_location: metLocation,
    met_location_geo: metLocationGeo,
    current_location: currentLocation,
    current_location_geo: currentLocationGeo,
    home_location: homeLocation,
    home_location_geo: homeLocationGeo,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("people")
    .update(update)
    .eq("id", personId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (error) {
    redirect(
      `/people/${personId}/edit?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  redirect(`/people/${personId}?saved=1`);
}
