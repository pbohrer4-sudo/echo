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
  PhoneEntry,
  Purpose,
} from "@/lib/types";

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

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 50)
    .slice(0, 7); // Briefing 5.x: max 7 Tags pro Person
}

export async function createPersonQuick(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // — 4 Pflichtfelder —
  const name = trimOrNull(formData.get("name"));
  const howWeMet = trimOrNull(formData.get("how_we_met"));
  const purposeRaw = formData.get("purpose");
  const depthRaw = formData.get("depth"); // "auto" oder ein Depth-Wert

  if (!name) {
    redirect(`/people/new?error=${encodeURIComponent("Name fehlt")}`);
  }
  if (!howWeMet) {
    redirect(
      `/people/new?error=${encodeURIComponent("Wie wir uns kennengelernt haben fehlt")}`,
    );
  }
  const purpose: Purpose | null =
    typeof purposeRaw === "string" && PURPOSE_VALUES.includes(purposeRaw as Purpose)
      ? (purposeRaw as Purpose)
      : null;
  if (!purpose) {
    redirect(`/people/new?error=${encodeURIComponent("Zweck fehlt")}`);
  }

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
  const tagInput = trimOrNull(formData.get("tags"));
  const metDate = dateOrNull(formData.get("met_date"));
  const metLocation = trimOrNull(formData.get("met_location"));

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
      socials: [],
      important_dates: [] as ImportantDate[],
      relationships: [],
      // Briefing-v3-Schema (Legacy-Spalten weg seit 0025).
      how_we_met: howWeMet,
      met_date: metDate,
      met_location: metLocation,
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

  // Tags anlegen + verknüpfen (idempotent via getOrCreateTag).
  // Nicht inline mit dem Insert, weil supabase-js keine atomare
  // Cross-Tabelle-Transaktion bietet. Failure hier blockt den Person-
  // Create nicht — Tags sind nice-to-have.
  const tagNames = parseTags(tagInput);
  if (tagNames.length > 0) {
    for (const tagName of tagNames) {
      const { data: existingTag } = await supabase
        .from("tags")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", tagName)
        .maybeSingle();

      let tagId = existingTag?.id ?? null;
      if (!tagId) {
        const { data: inserted } = await supabase
          .from("tags")
          .insert({
            user_id: user.id,
            name: tagName,
            cluster: "interests",
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

  revalidatePath("/people");
  redirect(`/people/${newPerson.id}`);
}
