import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolCall } from "@/lib/tools";
import {
  parseAddresses,
  parseEmails,
  parseImportantDates,
  parsePhones,
  parseSocials,
  stringArray,
  stringOr,
  stringOrNull,
} from "@/lib/parse-contact";
import {
  applyRelationshipEdges,
  mirrorSymmetric,
  parseRawRel,
  resolveRelatedIds,
} from "@/lib/relationships";
import { resolveOrCreateOrganization } from "@/lib/organizations";
import { addTagToPerson, getOrCreateTag } from "@/lib/tags";
import type {
  ContactChannel,
  EmailEntry,
  PhoneEntry,
  SocialEntry,
  AddressEntry,
} from "@/lib/types";

// Shared commit core for the voice-extraction pipeline.
//
// Both entry points run this identical logic, differing only in how they
// authenticate and which Supabase client they hand in:
//   - app/api/extract/commit  → cookie session client + auth.getUser()
//   - app/api/siri/capture     → service-role admin client + token-resolved
//                                user_id (no session)
//
// Because every read/write here is already explicitly scoped by user_id
// (RLS was treated as defence-in-depth, not the only guard), the same code
// is safe under the admin client as long as the caller passes a verified
// user_id — which the token resolver guarantees.

// V3 (0030): Voice-Extract schreibt zusätzlich in die strukturierten
// Tabellen. JSONB-Felder bleiben in der Transition als source-of-truth
// in der UI — die Tabellen wachsen mit jedem Voice-Turn parallel.

function socialPlatformToChannel(
  platform: string | undefined | null,
): ContactChannel {
  const p = (platform ?? "").toLowerCase();
  if (p.includes("linkedin")) return "linkedin";
  if (p.includes("instagram")) return "instagram";
  if (p.includes("twitter") || p === "x") return "twitter";
  if (p.includes("github")) return "github";
  if (p.includes("mastodon")) return "mastodon";
  if (p.includes("bluesky")) return "bluesky";
  if (p.includes("threads")) return "threads";
  if (p.includes("tiktok")) return "tiktok";
  if (p.includes("telegram")) return "telegram";
  if (p.includes("signal")) return "signal";
  if (p.includes("calendly")) return "calendly";
  if (p.includes("website")) return "website";
  return "other";
}

interface V3SyncSupabase {
  from: (table: string) => {
    insert: (
      rows: Record<string, unknown> | Record<string, unknown>[],
    ) => Promise<{ error: { message: string } | null }>;
  };
}

async function syncContactsToV3(args: {
  supabase: V3SyncSupabase;
  userId: string;
  personId: string;
  phones?: PhoneEntry[];
  emails?: EmailEntry[];
  socials?: SocialEntry[];
  source?: "voice_extract" | "manual";
}): Promise<void> {
  const { supabase, userId, personId } = args;
  const source = args.source ?? "voice_extract";
  const inserts: Record<string, unknown>[] = [];

  for (const p of args.phones ?? []) {
    if (!p?.value) continue;
    inserts.push({
      user_id: userId,
      person_id: personId,
      channel: "phone",
      subtype: p.label || null,
      value: p.value,
      source,
    });
  }
  for (const e of args.emails ?? []) {
    if (!e?.value) continue;
    inserts.push({
      user_id: userId,
      person_id: personId,
      channel: "email",
      subtype: e.label || null,
      value: e.value,
      source,
    });
  }
  for (const s of args.socials ?? []) {
    if (!s?.handle_or_url) continue;
    inserts.push({
      user_id: userId,
      person_id: personId,
      channel: socialPlatformToChannel(s.platform),
      value: s.handle_or_url,
      source,
    });
  }
  if (inserts.length === 0) return;
  const { error } = await supabase.from("person_contacts").insert(inserts);
  if (error) {
    console.error("[commit] syncContactsToV3 failed", error.message);
  }
}

// V3 (0030) — Beziehungs-Label aus dem Voice-Free-Text auf den
// strukturierten relationship_type-Enum mappen.
function labelToRelationshipType(label: string): string {
  const l = label.toLowerCase().trim();
  if (l === "ehepartner:in" || l === "ehepartner") return "spouse";
  if (l === "partner:in" || l === "partner") return "partner";
  if (l === "mutter" || l === "vater" || l === "elternteil") return "parent";
  if (l === "sohn" || l === "tochter" || l === "kind") return "child";
  if (l === "bruder" || l === "schwester" || l === "geschwister")
    return "sibling";
  if (l === "freund:in" || l === "freund" || l === "freundin") return "friend";
  if (l === "kolleg:in" || l === "kollege" || l === "kollegin")
    return "colleague";
  if (l === "mentor:in" || l === "mentor") return "mentor";
  if (l === "mentee") return "mentee";
  if (l === "co-founder" || l === "co_founder" || l === "mitgründer:in")
    return "co_founder";
  if (l.includes("vorgesetzt")) return "former_manager";
  if (l === "investor:in" || l === "investor") return "investor";
  if (l === "advisor") return "advisor";
  if (l.includes("vermittelt") || l.includes("intro")) return "introduced_by";
  if (l === "familie") return "family";
  return "custom";
}

async function syncRelationshipsToV3(args: {
  supabase: V3SyncSupabase;
  userId: string;
  edges: { from: string; to: string; label: string }[];
}): Promise<void> {
  if (args.edges.length === 0) return;
  const rows = args.edges
    .filter((e) => e.from !== e.to)
    .map((e) => ({
      user_id: args.userId,
      person_id: e.from,
      related_person_id: e.to,
      relationship_type: labelToRelationshipType(e.label),
      label: e.label,
      created_by: "user",
    }));
  if (rows.length === 0) return;
  for (const row of rows) {
    const { error } = await args.supabase
      .from("person_relationships")
      .insert(row);
    if (error && !error.message.includes("duplicate key")) {
      console.error("[commit] syncRelationshipsToV3 row failed", error.message);
    }
  }
}

async function syncTagsAndPassions(args: {
  supabase: SupabaseClient;
  userId: string;
  personId: string;
  tags: string[];
  passions: string[];
}): Promise<void> {
  for (const raw of args.tags) {
    const name = raw.trim();
    if (!name) continue;
    const tagRow = await getOrCreateTag({
      name,
      cluster: "interests",
      override: { client: args.supabase, userId: args.userId },
    });
    if (!tagRow) continue;
    const res = await addTagToPerson(args.personId, tagRow.id, args.supabase);
    if (!res.ok) {
      console.warn("[commit] addTagToPerson skipped", {
        personId: args.personId,
        tag: name,
        reason: res.reason,
      });
    }
  }

  const passionRows: Record<string, unknown>[] = [];
  for (const raw of args.passions) {
    const name = raw.trim();
    if (!name) continue;
    passionRows.push({
      user_id: args.userId,
      person_id: args.personId,
      name,
    });
  }
  if (passionRows.length === 0) return;
  const { error } = await (args.supabase as unknown as V3SyncSupabase)
    .from("passions")
    .insert(passionRows);
  if (error) {
    console.warn("[commit] passions insert failed", error.message);
  }
}

async function syncAddressesToV3(args: {
  supabase: V3SyncSupabase;
  userId: string;
  personId: string;
  addresses?: AddressEntry[];
}): Promise<void> {
  const { supabase, userId, personId } = args;
  const inserts: Record<string, unknown>[] = [];
  for (const a of args.addresses ?? []) {
    const hasAny = a?.street || a?.city || a?.postal_code || a?.country;
    if (!hasAny) continue;
    const display =
      [a.street, a.city, a.country].filter(Boolean).join(", ") ||
      a.label ||
      "Adresse";
    inserts.push({
      user_id: userId,
      person_id: personId,
      geo_type: "custom",
      custom_label: a.label || null,
      is_active: true,
      display_name: display,
      street: a.street || null,
      postal_code: a.postal_code || null,
      city: a.city || null,
      country: a.country || null,
    });
  }
  if (inserts.length === 0) return;
  const { error } = await supabase.from("person_geographies").insert(inserts);
  if (error) {
    console.error("[commit] syncAddressesToV3 failed", error.message);
  }
}

export interface Commits {
  people: number;
  interactions: number;
  notes: number;
  reminders: number;
  todos: number;
}

export interface CommitResult {
  commits: Commits;
  // lower-case name → UUID for every person created this turn (incl.
  // relationship auto-create stubs). Lets the caller link green chips.
  created_person_ids: Record<string, string>;
}

export class CommitError extends Error {
  commits: Commits;
  constructor(message: string, commits: Commits) {
    super(message);
    this.name = "CommitError";
    this.commits = commits;
  }
}

// Persist a confirmed set of extraction tool calls for `userId`, using the
// provided Supabase client. Throws CommitError on a hard DB failure so the
// caller can map it to the right HTTP status while still reporting partial
// progress via err.commits.
export async function commitToolCalls(args: {
  supabase: SupabaseClient;
  userId: string;
  toolCalls: ToolCall[];
}): Promise<CommitResult> {
  const { supabase, userId } = args;
  const calls = Array.isArray(args.toolCalls) ? args.toolCalls : [];
  const commits: Commits = {
    people: 0,
    interactions: 0,
    notes: 0,
    reminders: 0,
    todos: 0,
  };

  // Pass 1: create_person — collect new name → UUID mapping so subsequent
  // tools (log_interaction, create_note, etc.) can reference them.
  const newByName = new Map<string, string>();

  type RawRel = NonNullable<ReturnType<typeof parseRawRel>>;
  const pendingRelEdges: { fromPersonId: string; rawRel: RawRel }[] = [];

  for (const call of calls) {
    if (call.name !== "create_person") continue;
    const input = call.input as Record<string, unknown>;
    const name = String(input.name ?? "").trim();
    if (!name) continue;

    const phones = parsePhones(input.phones);
    const emails = parseEmails(input.emails);
    const socials = parseSocials(input.socials);
    const addresses = parseAddresses(input.addresses);

    const companyText = stringOrNull(input.company);
    const organization_id = await resolveOrCreateOrganization(
      companyText,
      userId,
      supabase,
    );

    const { data, error } = await supabase
      .from("people")
      .insert({
        user_id: userId,
        name,
        company: companyText,
        organization_id,
        role: stringOrNull(input.role),
        notes: stringOrNull(input.notes),
        gift_idea: stringOrNull(input.gift_idea),
        how_we_met: stringOrNull(input.how_we_met),
        met_date: stringOrNull(input.met_date),
        met_location: stringOrNull(input.met_location),
        phones,
        emails,
        addresses,
        socials,
        important_dates: parseImportantDates(input.important_dates),
      })
      .select("id, name")
      .single();

    if (error || !data) {
      throw new CommitError(
        `create_person: ${error?.message ?? "no row returned"}`,
        commits,
      );
    }
    newByName.set(name.toLowerCase(), data.id);
    commits.people += 1;

    await syncContactsToV3({
      supabase: supabase as unknown as V3SyncSupabase,
      userId,
      personId: data.id,
      phones,
      emails,
      socials,
    });
    await syncAddressesToV3({
      supabase: supabase as unknown as V3SyncSupabase,
      userId,
      personId: data.id,
      addresses,
    });
    await syncTagsAndPassions({
      supabase,
      userId,
      personId: data.id,
      tags: stringArray(input.tags),
      passions: stringArray(input.passions),
    });

    if (Array.isArray(input.relationships)) {
      for (const raw of input.relationships) {
        const parsed = parseRawRel(raw);
        if (parsed)
          pendingRelEdges.push({ fromPersonId: data.id, rawRel: parsed });
      }
    }
  }

  // Pass 1.5: update_person — fill-if-empty on scalars, append on arrays.
  for (const call of calls) {
    if (call.name !== "update_person") continue;
    const input = call.input as Record<string, unknown>;
    const id = stringOrNull(input.id);
    if (!id) continue;

    const existingRes = await supabase
      .from("people")
      .select(
        "company, organization_id, role, notes, gift_idea, how_we_met, met_date, met_location, tags, phones, emails, addresses, socials, important_dates",
      )
      .eq("id", id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingRes.error || !existingRes.data) continue;
    const existing = existingRes.data as {
      company: string | null;
      organization_id: string | null;
      role: string | null;
      notes: string | null;
      gift_idea: string | null;
      how_we_met: string | null;
      met_date: string | null;
      met_location: string | null;
      tags: string[] | null;
      phones: unknown;
      emails: unknown;
      addresses: unknown;
      socials: unknown;
      important_dates: unknown;
    };

    const update: Record<string, unknown> = {};
    if (typeof input.company === "string" && !existing.company) {
      const companyText = stringOrNull(input.company);
      if (companyText) {
        update.company = companyText;
        update.organization_id = await resolveOrCreateOrganization(
          companyText,
          userId,
          supabase,
        );
      }
    }
    if (typeof input.role === "string" && !existing.role) {
      const v = stringOrNull(input.role);
      if (v) update.role = v;
    }
    if (typeof input.scope === "string")
      update.scope = scopeOr(input.scope, "both");
    if (typeof input.notes === "string" && !existing.notes) {
      const v = stringOrNull(input.notes);
      if (v) update.notes = v;
    }
    if (typeof input.how_we_met === "string" && !existing.how_we_met) {
      const v = stringOrNull(input.how_we_met);
      if (v) update.how_we_met = v;
    }
    if (typeof input.met_date === "string" && !existing.met_date) {
      const v = stringOrNull(input.met_date);
      if (v) update.met_date = v;
    }
    if (typeof input.met_location === "string" && !existing.met_location) {
      const v = stringOrNull(input.met_location);
      if (v) update.met_location = v;
    }
    if (typeof input.gift_idea === "string") {
      const fresh = stringOrNull(input.gift_idea);
      if (fresh) {
        const current = existing.gift_idea?.trim() ?? "";
        if (!current) {
          update.gift_idea = fresh;
        } else {
          const parts = current.split(" · ").map((s) => s.trim().toLowerCase());
          if (!parts.includes(fresh.toLowerCase())) {
            update.gift_idea = `${current} · ${fresh}`;
          }
        }
      }
    }

    const addTags = stringArray(input.add_tags);
    if (addTags.length) {
      const merged = [...(existing.tags ?? []), ...addTags];
      update.tags = Array.from(new Set(merged));
    }

    const addPhones = parsePhones(input.add_phones);
    if (addPhones.length) {
      update.phones = [...parsePhones(existing.phones), ...addPhones];
    }

    const addEmails = parseEmails(input.add_emails);
    if (addEmails.length) {
      update.emails = [...parseEmails(existing.emails), ...addEmails];
    }

    const addAddresses = parseAddresses(input.add_addresses);
    if (addAddresses.length) {
      update.addresses = [
        ...parseAddresses(existing.addresses),
        ...addAddresses,
      ];
    }

    const addSocials = parseSocials(input.add_socials);
    if (addSocials.length) {
      update.socials = [...parseSocials(existing.socials), ...addSocials];
    }

    const addDates = parseImportantDates(input.add_important_dates);
    if (addDates.length) {
      update.important_dates = [
        ...parseImportantDates(existing.important_dates),
        ...addDates,
      ];
    }

    if (Array.isArray(input.add_relationships)) {
      for (const raw of input.add_relationships) {
        const parsed = parseRawRel(raw);
        if (parsed) pendingRelEdges.push({ fromPersonId: id, rawRel: parsed });
      }
    }

    if (Object.keys(update).length === 0) continue;

    const { error } = await supabase
      .from("people")
      .update(update)
      .eq("id", id)
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (error) {
      throw new CommitError(`update_person: ${error.message}`, commits);
    }
    commits.people += 1;

    if (addPhones.length || addEmails.length || addSocials.length) {
      await syncContactsToV3({
        supabase: supabase as unknown as V3SyncSupabase,
        userId,
        personId: id,
        phones: addPhones,
        emails: addEmails,
        socials: addSocials,
      });
    }
    if (addAddresses.length) {
      await syncAddressesToV3({
        supabase: supabase as unknown as V3SyncSupabase,
        userId,
        personId: id,
        addresses: addAddresses,
      });
    }

    const addPassions = stringArray(input.add_passions);
    if (addTags.length || addPassions.length) {
      await syncTagsAndPassions({
        supabase,
        userId,
        personId: id,
        tags: addTags,
        passions: addPassions,
      });
    }
  }

  // Pass 1.7: relationships.
  if (pendingRelEdges.length > 0) {
    const resolveMap = await resolveRelatedIds({
      supabase,
      userId,
      newByName,
      rawRels: pendingRelEdges.map((e) => e.rawRel),
    });

    for (const e of pendingRelEdges) {
      if (e.rawRel.id) continue;
      const name = e.rawRel.name?.trim();
      if (!name) continue;
      if (resolveMap.has(name)) continue;
      const { data: created, error: createErr } = await supabase
        .from("people")
        .insert({
          user_id: userId,
          name,
          purpose: "personal",
        })
        .select("id")
        .single();
      if (createErr || !created) {
        console.warn(
          "[commit] auto-create related person failed",
          name,
          createErr?.message,
        );
        continue;
      }
      const newId = (created as { id: string }).id;
      resolveMap.set(name, newId);
      newByName.set(name.toLowerCase(), newId);
      commits.people += 1;
    }

    const directedEdges: { from: string; to: string; label: string }[] = [];
    for (const e of pendingRelEdges) {
      const lookupKey = e.rawRel.id ?? e.rawRel.name ?? "";
      const toId = resolveMap.get(lookupKey);
      if (!toId) continue;
      if (toId === e.fromPersonId) continue;
      directedEdges.push({
        from: e.fromPersonId,
        to: toId,
        label: e.rawRel.label,
      });
    }

    const allEdges = mirrorSymmetric(directedEdges);
    try {
      await applyRelationshipEdges({ supabase, userId, edges: allEdges });
    } catch (err) {
      console.error("relationship apply failed", err);
    }
    try {
      await syncRelationshipsToV3({
        supabase: supabase as unknown as V3SyncSupabase,
        userId,
        edges: allEdges,
      });
    } catch (err) {
      console.error("v3 relationship sync failed", err);
    }
  }

  const resolvePersonId = (input: Record<string, unknown>): string | null => {
    if (typeof input.person_id === "string" && input.person_id) {
      return input.person_id;
    }
    if (typeof input.person_name === "string" && input.person_name) {
      return newByName.get(input.person_name.toLowerCase()) ?? null;
    }
    return null;
  };

  const resolvePersonIds = (input: Record<string, unknown>): string[] => {
    const ids: string[] = [];
    if (Array.isArray(input.person_ids)) {
      for (const v of input.person_ids) {
        if (typeof v === "string" && v) ids.push(v);
      }
    }
    if (Array.isArray(input.person_names)) {
      for (const v of input.person_names) {
        if (typeof v === "string") {
          const id = newByName.get(v.toLowerCase());
          if (id) ids.push(id);
        }
      }
    }
    return ids;
  };

  // Pass 2: everything else.
  for (const call of calls) {
    const input = call.input as Record<string, unknown>;

    if (call.name === "log_interaction") {
      const personIds = resolvePersonIds(input);
      const { error } = await supabase.from("interactions").insert({
        user_id: userId,
        person_ids: personIds,
        type: stringOr(input.type, "voice"),
        source: "debrief",
        summary: stringOrNull(input.summary),
        sentiment: sentimentOrNull(input.sentiment),
        topics: stringArray(input.topics),
        occurred_at: stringOrNull(input.occurred_at) ?? new Date().toISOString(),
      });
      if (error) {
        throw new CommitError(`log_interaction: ${error.message}`, commits);
      }
      commits.interactions += 1;

      if (personIds.length) {
        const { error: bumpError } = await supabase
          .from("people")
          .update({ last_contact_at: new Date().toISOString() })
          .in("id", personIds)
          .eq("user_id", userId)
          .is("deleted_at", null);
        if (bumpError) {
          console.error("last_contact_at bump failed", bumpError);
        }
      }
      continue;
    }

    if (call.name === "create_note") {
      const body = stringOrNull(input.body);
      const title = stringOrNull(input.title);
      if (!body && !title) continue;
      const { error } = await supabase.from("notes").insert({
        user_id: userId,
        person_id: resolvePersonId(input),
        title,
        body: body ?? "",
        tags: stringArray(input.tags),
        source: "voice",
      });
      if (error) {
        throw new CommitError(`create_note: ${error.message}`, commits);
      }
      commits.notes += 1;
      continue;
    }

    if (call.name === "create_reminder") {
      const remindAt = stringOrNull(input.remind_at);
      const text = stringOrNull(input.text);
      if (!remindAt || !text) continue;
      const { error } = await supabase.from("reminders").insert({
        user_id: userId,
        person_id: resolvePersonId(input),
        text,
        remind_at: remindAt,
        recurrence: recurrenceOr(input.recurrence, "once"),
        type: reminderTypeOr(input.type, "custom"),
        status: "pending",
        source: "voice",
      });
      if (error) {
        throw new CommitError(`create_reminder: ${error.message}`, commits);
      }
      commits.reminders += 1;
      continue;
    }

    if (call.name === "create_todo") {
      const text = stringOrNull(input.text);
      if (!text) continue;
      const { error } = await supabase.from("todos").insert({
        user_id: userId,
        person_id: resolvePersonId(input),
        text,
        due_date: stringOrNull(input.due_date),
        priority: priorityOr(input.priority, "medium"),
        status: "open",
      });
      if (error) {
        throw new CommitError(`create_todo: ${error.message}`, commits);
      }
      commits.todos += 1;
      continue;
    }
  }

  const createdByName: Record<string, string> = {};
  for (const [name, id] of newByName.entries()) {
    createdByName[name] = id;
  }
  return { commits, created_person_ids: createdByName };
}

function scopeOr(v: unknown, fallback: "work" | "personal" | "both") {
  return v === "work" || v === "personal" || v === "both" ? v : fallback;
}

function sentimentOrNull(v: unknown) {
  return v === "positive" || v === "neutral" || v === "tense" ? v : null;
}

function recurrenceOr(
  v: unknown,
  fallback: "once" | "weekly" | "monthly" | "yearly",
) {
  return v === "once" || v === "weekly" || v === "monthly" || v === "yearly"
    ? v
    : fallback;
}

function reminderTypeOr(
  v: unknown,
  fallback: "check-in" | "birthday" | "promise" | "custom",
) {
  return v === "check-in" ||
    v === "birthday" ||
    v === "promise" ||
    v === "custom"
    ? v
    : fallback;
}

function priorityOr(v: unknown, fallback: "low" | "medium" | "high") {
  return v === "low" || v === "medium" || v === "high" ? v : fallback;
}
