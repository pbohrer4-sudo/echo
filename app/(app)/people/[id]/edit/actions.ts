"use server";

// Server-Action für die volle Edit-Form. Scalar-Updates + Axes
// (Zweck/Tiefe/Modus/Cadence) + Birthday (in important_dates JSONB)
// + Cluster-Diff (tags/passions/circles via add/remove gegen den
// aktuellen DB-Stand).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveOrCreateOrganization } from "@/lib/organizations";
import { parseLocationGeo } from "@/lib/location-geo-parse";
import type {
  Depth,
  ImportantDate,
  Mode,
  Purpose,
  TagCluster,
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
const MODE_VALUES: Mode[] = [
  "active",
  "nurture",
  "dormant",
  "reconnect",
  "archive",
];
const VALID_CLUSTERS: TagCluster[] = [
  "reminders",
  "interests",
  "potential",
  "origin",
];

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

interface ParsedCluster {
  tags: Record<TagCluster, string[]>;
  passions: string[];
  circles: string[];
}
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
    // ignore
  }
  return empty;
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
  const metLocationGeo = parseLocationGeo(formData.get("met_location_geo"));
  const currentLocation = trimOrNull(formData.get("current_location"));
  const currentLocationGeo = parseLocationGeo(
    formData.get("current_location_geo"),
  );
  const homeLocation = trimOrNull(formData.get("home_location"));
  const homeLocationGeo = parseLocationGeo(formData.get("home_location_geo"));
  const birthday = dateOrNull(formData.get("birthday"));

  // Axes
  const purposeRaw = formData.get("purpose");
  const purpose: Purpose | null =
    typeof purposeRaw === "string" &&
    PURPOSE_VALUES.includes(purposeRaw as Purpose)
      ? (purposeRaw as Purpose)
      : null;
  const depthRaw = formData.get("depth");
  let depth: Depth | null = null;
  let depthSource: "auto" | "manual_override" = "auto";
  if (typeof depthRaw === "string" && depthRaw !== "auto") {
    if (DEPTH_VALUES.includes(depthRaw as Depth)) {
      depth = depthRaw as Depth;
      depthSource = "manual_override";
    }
  }
  const modeRaw = formData.get("mode");
  const mode: Mode = MODE_VALUES.includes(modeRaw as Mode)
    ? (modeRaw as Mode)
    : "active";
  const cadenceRaw = trimOrNull(formData.get("cadence_days"));
  const cadenceDays =
    cadenceRaw && /^\d+$/.test(cadenceRaw)
      ? Math.min(365, Math.max(1, parseInt(cadenceRaw, 10)))
      : null;

  // Org neu auflösen wenn Firma sich ändert.
  const organization_id = await resolveOrCreateOrganization(company, user.id);

  // Existing-Person für important_dates-Merge holen.
  const { data: existing } = await supabase
    .from("people")
    .select("important_dates")
    .eq("id", personId)
    .eq("user_id", user.id)
    .maybeSingle();
  const existingDates = (existing?.important_dates ?? []) as ImportantDate[];
  const datesWithoutBirthday = existingDates.filter(
    (d) => !d.label.toLowerCase().includes("geburt"),
  );
  const importantDates: ImportantDate[] = birthday
    ? [
        ...datesWithoutBirthday,
        { label: "Geburtstag", date: birthday, remind: true },
      ]
    : datesWithoutBirthday;

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
    purpose,
    depth,
    depth_source: depthSource,
    mode,
    cadence_days: cadenceDays,
    important_dates: importantDates,
    updated_at: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .from("people")
    .update(update)
    .eq("id", personId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (updateErr) {
    redirect(
      `/people/${personId}/edit?error=${encodeURIComponent(updateErr.message)}`,
    );
  }

  // Cluster-Diff: aktueller DB-Stand vs gewünschter Form-Stand →
  // add / remove. Tags wandern in den Cluster den die Form sagt.
  const desired = parseClusterState(formData.get("cluster_state"));
  await reconcileCluster(supabase, user.id, personId, desired);

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  redirect(`/people/${personId}?saved=1`);
}

// ─────────── Cluster-Reconcile ───────────
// Holt den IST-Zustand aus DB, vergleicht mit dem SOLL aus der Form,
// macht die Delta-Inserts und -Deletes. Tags werden case-insensitive
// dedupliziert (db speichert lower-cased).

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

async function reconcileCluster(
  supabase: SupabaseLike,
  userId: string,
  personId: string,
  desired: ParsedCluster,
): Promise<void> {
  // ── TAGS ──────────────────────────────────────────────
  const { data: currentTagsData } = await supabase
    .from("person_tags")
    .select("tag_id, tags(id, name, cluster)")
    .eq("person_id", personId);
  type CurrentTagRow = {
    tag_id: string;
    tags: { id: string; name: string; cluster: TagCluster } | null;
  };
  const currentTagRows = (currentTagsData ?? []) as unknown as CurrentTagRow[];

  // Build map name(lower)+cluster → tag-row für schnellen Lookup.
  const currentTagByKey = new Map<string, CurrentTagRow>();
  for (const row of currentTagRows) {
    if (!row.tags) continue;
    const key = `${row.tags.name.toLowerCase()}|${row.tags.cluster}`;
    currentTagByKey.set(key, row);
  }

  // Desired in same key shape (lower-cased names).
  const desiredKeys = new Set<string>();
  for (const cluster of VALID_CLUSTERS) {
    for (const raw of desired.tags[cluster]) {
      const name = raw.trim().toLowerCase();
      if (!name) continue;
      desiredKeys.add(`${name}|${cluster}`);
    }
  }

  // To-Add: in desired, not in current.
  for (const cluster of VALID_CLUSTERS) {
    for (const raw of desired.tags[cluster]) {
      const name = raw.trim().toLowerCase();
      if (!name) continue;
      const key = `${name}|${cluster}`;
      if (currentTagByKey.has(key)) continue;
      // getOrCreateTag inline.
      const { data: existingTag } = await supabase
        .from("tags")
        .select("id")
        .eq("user_id", userId)
        .eq("name", name)
        .maybeSingle();
      let tagId = existingTag?.id ?? null;
      if (!tagId) {
        const { data: inserted } = await supabase
          .from("tags")
          .insert({
            user_id: userId,
            name,
            cluster,
            created_by: "user",
          })
          .select("id")
          .single();
        tagId = inserted?.id ?? null;
      } else {
        // Wenn Tag existiert aber im falschen Cluster, ggf updaten —
        // hier konservativ: lass den Cluster wie er ist (User kann ihn
        // auf Detail-Seite über Suggestion-System ändern).
      }
      if (tagId) {
        await supabase
          .from("person_tags")
          .insert({ person_id: personId, tag_id: tagId });
      }
    }
  }

  // To-Remove: in current, not in desired.
  for (const [key, row] of currentTagByKey) {
    if (desiredKeys.has(key)) continue;
    await supabase
      .from("person_tags")
      .delete()
      .eq("person_id", personId)
      .eq("tag_id", row.tag_id);
  }

  // ── PASSIONS ──────────────────────────────────────────
  const { data: currentPassions } = await supabase
    .from("passions")
    .select("id, name")
    .eq("person_id", personId);
  type CurrentPassion = { id: string; name: string };
  const currentPassionByLower = new Map<string, CurrentPassion>();
  for (const p of (currentPassions ?? []) as CurrentPassion[]) {
    currentPassionByLower.set(p.name.toLowerCase(), p);
  }
  const desiredPassionLower = new Set(
    desired.passions
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean),
  );

  // Add new
  for (const raw of desired.passions) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (currentPassionByLower.has(trimmed.toLowerCase())) continue;
    await supabase.from("passions").insert({
      user_id: userId,
      person_id: personId,
      name: trimmed,
    });
  }
  // Remove missing
  for (const [lower, row] of currentPassionByLower) {
    if (desiredPassionLower.has(lower)) continue;
    await supabase.from("passions").delete().eq("id", row.id);
  }

  // ── CIRCLES ───────────────────────────────────────────
  const { data: currentPC } = await supabase
    .from("person_circles")
    .select("circle_id, circles(id, name)")
    .eq("person_id", personId);
  type CurrentCircle = {
    circle_id: string;
    circles: { id: string; name: string } | null;
  };
  const currentCircleByLower = new Map<string, CurrentCircle>();
  for (const row of (currentPC ?? []) as unknown as CurrentCircle[]) {
    if (!row.circles) continue;
    currentCircleByLower.set(row.circles.name.toLowerCase(), row);
  }
  const desiredCircleLower = new Set(
    desired.circles
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
  );

  // Add new
  for (const raw of desired.circles) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (currentCircleByLower.has(trimmed.toLowerCase())) continue;
    const { data: existingCircle } = await supabase
      .from("circles")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", trimmed)
      .maybeSingle();
    let circleId = existingCircle?.id ?? null;
    if (!circleId) {
      const { data: inserted } = await supabase
        .from("circles")
        .insert({ user_id: userId, name: trimmed })
        .select("id")
        .single();
      circleId = inserted?.id ?? null;
    }
    if (circleId) {
      await supabase
        .from("person_circles")
        .insert({ person_id: personId, circle_id: circleId });
    }
  }
  // Remove missing
  for (const [lower, row] of currentCircleByLower) {
    if (desiredCircleLower.has(lower)) continue;
    await supabase
      .from("person_circles")
      .delete()
      .eq("person_id", personId)
      .eq("circle_id", row.circle_id);
  }
}
