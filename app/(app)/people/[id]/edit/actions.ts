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
import { getFieldDefs } from "@/lib/custom-fields.server";
import { coerceValue, type CustomFieldValues } from "@/lib/custom-fields";
import type {
  AddressEntry,
  ContactChannel,
  Depth,
  ImportantDate,
  Mode,
  Purpose,
  TagCluster,
} from "@/lib/types";
import { CONTACT_CHANNELS, MODE_VALUES } from "@/lib/types";

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

// Validates submitted custom-field values against the user's own field
// definitions. Drops unknown keys (deleted defs) and coerces each value
// to the def's declared type.
async function parseCustomFieldValues(
  raw: FormDataEntryValue | null,
): Promise<CustomFieldValues> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  let parsed: Record<string, unknown>;
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || Array.isArray(j)) return {};
    parsed = j as Record<string, unknown>;
  } catch {
    return {};
  }
  const defs = await getFieldDefs();
  const out: CustomFieldValues = {};
  for (const def of defs) {
    const v = parsed[def.id];
    if (def.type === "checkbox") {
      out[def.id] = v === true || v === "true" || v === "on" || v === "1";
      continue;
    }
    const asStr =
      v === null || v === undefined ? null : String(v);
    out[def.id] = coerceValue(def, asStr);
  }
  return out;
}

function dateOrNull(v: FormDataEntryValue | null): string | null {
  const t = trimOrNull(v);
  if (!t) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

// Synergies: JSON array of strings from the hidden input. Trims, drops
// empties. No limit (Patrick: "no tag limitations").
function parseSynergies(v: FormDataEntryValue | null): string[] {
  if (typeof v !== "string" || !v.trim()) return [];
  try {
    const arr = JSON.parse(v);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
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

// Returns a set (as Map<id, true>) of the given ids that are people
// owned by `userId` and not soft-deleted. Used to reject cross-tenant
// person-ref ids before storing them.
async function ownedPersonIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ids: (string | null)[],
): Promise<Map<string, true>> {
  const wanted = ids.filter((x): x is string => !!x);
  const out = new Map<string, true>();
  if (wanted.length === 0) return out;
  const { data } = await supabase
    .from("people")
    .select("id")
    .in("id", wanted)
    .eq("user_id", userId)
    .is("deleted_at", null);
  for (const row of (data ?? []) as { id: string }[]) out.set(row.id, true);
  return out;
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
  const giftIdea = trimOrNull(formData.get("gift_idea"));
  const introducedBy = trimOrNull(formData.get("introduced_by"));
  const metWith = trimOrNull(formData.get("met_with"));
  // Person-ref ids must belong to the caller — don't store a pointer
  // into another tenant's id-space (FK existence alone doesn't enforce
  // ownership). Null out anything not owned.
  const ownedIds = await ownedPersonIds(supabase, user.id, [
    trimOrNull(formData.get("introduced_by_person_id")),
    trimOrNull(formData.get("met_with_person_id")),
  ]);
  const introducedByPersonId = ownedIds.get(
    trimOrNull(formData.get("introduced_by_person_id")) ?? "",
  )
    ? trimOrNull(formData.get("introduced_by_person_id"))
    : null;
  const metWithPersonId = ownedIds.get(
    trimOrNull(formData.get("met_with_person_id")) ?? "",
  )
    ? trimOrNull(formData.get("met_with_person_id"))
    : null;
  const primaryLanguage = trimOrNull(formData.get("primary_language"));
  // Language is mandatory (matches the create flow) — don't let an edit
  // silently clear it.
  if (!primaryLanguage) {
    redirect(
      `/people/${personId}/edit?error=${encodeURIComponent("Hauptsprache fehlt")}`,
    );
  }
  const secondaryLanguage = trimOrNull(formData.get("secondary_language"));
  const synergies = parseSynergies(formData.get("synergies"));
  const metDate = dateOrNull(formData.get("met_date"));
  const metLocation = trimOrNull(formData.get("met_location"));
  const metLocationGeo = parseLocationGeo(formData.get("met_location_geo"));
  const currentLocation = trimOrNull(formData.get("current_location"));
  const currentLocationGeo = parseLocationGeo(
    formData.get("current_location_geo"),
  );
  const homeLocation = trimOrNull(formData.get("home_location"));
  const homeLocationGeo = parseLocationGeo(formData.get("home_location_geo"));

  // Multi-Row-State aus den hidden JSONs.
  const desiredContacts = parseContactList(formData.get("contacts_state"));
  const desiredDates = parseDateList(formData.get("dates_state"));
  const desiredAddresses = parseAddressList(formData.get("addresses_state"));

  // Custom fields — validate the submitted values against the user's own
  // field definitions. Unknown keys (deleted defs) are dropped; each
  // value is coerced to its def's type.
  const customFieldValues = await parseCustomFieldValues(
    formData.get("custom_field_values"),
  );

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

  // important_dates kommen jetzt als komplette Liste vom Repeater —
  // wir überschreiben das JSONB komplett. Adressen analog.
  const importantDates = desiredDates;
  const addresses = desiredAddresses;

  const update: Record<string, unknown> = {
    name,
    company,
    organization_id,
    role,
    notes,
    photo_url: photoUrl,
    linkedin_url: linkedinUrl,
    how_we_met: howWeMet,
    gift_idea: giftIdea,
    introduced_by: introducedBy,
    introduced_by_person_id: introducedByPersonId,
    met_with: metWith,
    met_with_person_id: metWithPersonId,
    primary_language: primaryLanguage,
    secondary_language: secondaryLanguage,
    synergies,
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
    addresses,
    custom_field_values: customFieldValues,
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

  // Cluster + Contacts: jeder Schritt kann scheitern. Statt silent
  // zu schlucken (was am 2026-05-14 zu duplicate person_contacts-
  // Rows geführt hat — User sah keine Änderung, retry → 2 Rows)
  // jetzt error → redirect mit ?error=… damit der User es sieht.
  try {
    const desired = parseClusterState(formData.get("cluster_state"));
    await reconcileCluster(supabase, user.id, personId, desired);
    await reconcileContacts(supabase, user.id, personId, desiredContacts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    redirect(
      `/people/${personId}/edit?error=${encodeURIComponent(message)}`,
    );
  }

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
      // getOrCreateTag inline — lookup by name AND cluster so the same
      // name can live independently in different clusters (cross-fill
      // fix; matches the (user_id, lower(name), cluster) unique index).
      const { data: existingTag } = await supabase
        .from("tags")
        .select("id")
        .eq("user_id", userId)
        .eq("name", name)
        .eq("cluster", cluster)
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

// ─────────── Multi-Row-State-Parser ───────────

interface ContactInput {
  channel: ContactChannel;
  subtype: string | null;
  value: string;
  is_primary: boolean;
}

function parseContactList(raw: FormDataEntryValue | null): ContactInput[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: ContactInput[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const c = item as Record<string, unknown>;
      const channelRaw = typeof c.channel === "string" ? c.channel : "";
      if (!(CONTACT_CHANNELS as readonly string[]).includes(channelRaw)) continue;
      const value = typeof c.value === "string" ? c.value.trim() : "";
      if (!value) continue;
      out.push({
        channel: channelRaw as ContactChannel,
        subtype: typeof c.subtype === "string" && c.subtype.trim() ? c.subtype.trim() : null,
        value,
        is_primary: Boolean(c.is_primary),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function parseDateList(raw: FormDataEntryValue | null): ImportantDate[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: ImportantDate[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const d = item as Record<string, unknown>;
      const label = typeof d.label === "string" ? d.label.trim() : "";
      const date = typeof d.date === "string" ? d.date.trim() : "";
      if (!label || !date) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      out.push({
        label,
        date,
        remind: Boolean(d.remind),
        remind_lead_days: typeof d.remind_lead_days === "number" ? d.remind_lead_days : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function parseAddressList(raw: FormDataEntryValue | null): AddressEntry[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: AddressEntry[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const a = item as Record<string, unknown>;
      const label = typeof a.label === "string" ? a.label : "andere";
      const street = typeof a.street === "string" ? a.street.trim() : "";
      const city = typeof a.city === "string" ? a.city.trim() : "";
      const postal = typeof a.postal_code === "string" ? a.postal_code.trim() : "";
      const country = typeof a.country === "string" ? a.country.trim() : "";
      // Adresse nur behalten wenn mindestens ein Feld gefüllt ist.
      if (!street && !city && !postal && !country) continue;
      out.push({
        label,
        street: street || null,
        city: city || null,
        postal_code: postal || null,
        country: country || null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ─────────── Contacts-Reconcile ───────────
// Replace-all: delete alle bestehenden person_contacts + reinsert.
// Bei einer Edit-Form Submission ist das günstiger als per-Row-Diff
// und garantiert Konsistenz wenn der User Channels reordert.

async function reconcileContacts(
  supabase: SupabaseLike,
  userId: string,
  personId: string,
  desired: ContactInput[],
): Promise<void> {
  // Errors hier wurden früher silently geschluckt — wenn DELETE oder
  // INSERT fehlschlägt sieht der User die alten Daten unverändert
  // wieder, denkt der Save war ein no-op und probiert es nochmal.
  // Beim zweiten Versuch werden dann Duplikate erzeugt (klassischer
  // Fall am 2026-05-14 in production beobachtet). Jetzt werfen wir,
  // der Caller redirect't mit ?error=…
  const { error: delErr } = await supabase
    .from("person_contacts")
    .delete()
    .eq("person_id", personId);
  if (delErr) {
    throw new Error(`reconcileContacts.delete: ${delErr.message}`);
  }
  if (desired.length === 0) return;
  const rows = desired.map((c) => ({
    user_id: userId,
    person_id: personId,
    channel: c.channel,
    subtype: c.subtype,
    value: c.value,
    is_primary: c.is_primary,
    source: "manual",
  }));
  // Sicherstellen dass pro (person, channel) max einmal primary = true.
  // Wenn User mehrere als primary markiert (UI verhindert das, aber
  // hier defensiv), wird der ERSTE als primary behalten.
  const primarySeen = new Set<string>();
  for (const row of rows) {
    if (!row.is_primary) continue;
    if (primarySeen.has(row.channel)) {
      row.is_primary = false;
    } else {
      primarySeen.add(row.channel);
    }
  }
  const { error: insErr } = await supabase
    .from("person_contacts")
    .insert(rows);
  if (insErr) {
    throw new Error(`reconcileContacts.insert: ${insErr.message}`);
  }
}
