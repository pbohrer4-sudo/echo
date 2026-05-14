import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ToolCall } from "@/lib/tools";
import {
  findBirthday,
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
import type {
  ContactChannel,
  EmailEntry,
  PhoneEntry,
  SocialEntry,
  AddressEntry,
} from "@/lib/types";

export const runtime = "nodejs";

// V3 (0030): Voice-Extract schreibt zusätzlich in die strukturierten
// Tabellen. JSONB-Felder bleiben in der Transition als source-of-truth
// in der UI — die Tabellen wachsen mit jedem Voice-Turn parallel.

function socialPlatformToChannel(platform: string | undefined | null): ContactChannel {
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
  // upsert würden wir mit on-conflict-do-nothing wollen, supabase-js
  // exposed das nicht direkt — Bulk-Insert ignoriert Unique-Verletzungen
  // nicht, also pro Row einzeln einfügen und 23505 schlucken.
  for (const row of rows) {
    const { error } = await args.supabase
      .from("person_relationships")
      .insert(row);
    if (error && !error.message.includes("duplicate key")) {
      console.error("[commit] syncRelationshipsToV3 row failed", error.message);
    }
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
    const hasAny =
      a?.street || a?.city || a?.postal_code || a?.country;
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

interface CommitRequest {
  toolCalls: ToolCall[];
}

interface Commits {
  people: number;
  interactions: number;
  notes: number;
  reminders: number;
  todos: number;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CommitRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const calls = Array.isArray(body.toolCalls) ? body.toolCalls : [];
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

  // Relationship edges are deferred to Pass 1.7: we need both
  // create_person AND update_person done so we can resolve
  // related_person_name against the full set of new + existing people.
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

    // Auto-link / auto-create organization wenn der Voice-Extract eine
    // Firma mitliefert. Macht den Voice-Pfad konsistent mit dem
    // Form-Pfad in app/(app)/people/actions.ts — sonst landet die Org
    // nur als Freitext auf der Person und taucht nicht im
    // Organisationen-Tab auf.
    const companyText = stringOrNull(input.company);
    const organization_id = await resolveOrCreateOrganization(
      companyText,
      user.id,
    );

    const { data, error } = await supabase
      .from("people")
      .insert({
        user_id: user.id,
        name,
        company: companyText,
        organization_id,
        role: stringOrNull(input.role),
        notes: stringOrNull(input.notes),
        // Goldfeld + Met-Kontext aus Voice-Extraction.
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
      return NextResponse.json(
        { error: `create_person: ${error?.message ?? "no row returned"}`, commits },
        { status: 500 },
      );
    }
    newByName.set(name.toLowerCase(), data.id);
    commits.people += 1;

    // V3-Sync (0030): strukturierte Tabellen parallel füttern.
    await syncContactsToV3({
      supabase: supabase as unknown as V3SyncSupabase,
      userId: user.id,
      personId: data.id,
      phones,
      emails,
      socials,
    });
    await syncAddressesToV3({
      supabase: supabase as unknown as V3SyncSupabase,
      userId: user.id,
      personId: data.id,
      addresses,
    });

    // Stash any relationships for Pass 1.7. We can't resolve them yet
    // because related_person_name might point at a person not-yet-
    // created in a later call.
    if (Array.isArray(input.relationships)) {
      for (const raw of input.relationships) {
        const parsed = parseRawRel(raw);
        if (parsed) pendingRelEdges.push({ fromPersonId: data.id, rawRel: parsed });
      }
    }
  }

  // Pass 1.5: update_person — needs to read the existing row so we
  // can append to array fields rather than replace. Scope every read
  // and write to user_id explicitly: RLS guards us today, but the
  // commit endpoint trusts whatever toolCalls the client sends, so a
  // forged id from another tenant would otherwise no-op silently.
  for (const call of calls) {
    if (call.name !== "update_person") continue;
    const input = call.input as Record<string, unknown>;
    const id = stringOrNull(input.id);
    if (!id) continue;

    const existingRes = await supabase
      .from("people")
      .select(
        "tags, phones, emails, addresses, socials, important_dates",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingRes.error || !existingRes.data) continue;
    const existing = existingRes.data as {
      tags: string[] | null;
      phones: unknown;
      emails: unknown;
      addresses: unknown;
      socials: unknown;
      important_dates: unknown;
    };

    const update: Record<string, unknown> = {};
    if (typeof input.company === "string") {
      const companyText = stringOrNull(input.company);
      update.company = companyText;
      // Bei Firmen-Änderung auch organization_id neu auflösen — sonst
      // bleibt der alte FK-Pointer hängen oder fehlt komplett.
      update.organization_id = await resolveOrCreateOrganization(
        companyText,
        user.id,
      );
    }
    if (typeof input.role === "string")
      update.role = stringOrNull(input.role);
    if (typeof input.scope === "string")
      update.scope = scopeOr(input.scope, "both");
    if (typeof input.notes === "string")
      update.notes = stringOrNull(input.notes);
    if (typeof input.how_we_met === "string")
      update.how_we_met = stringOrNull(input.how_we_met);
    if (typeof input.met_date === "string")
      update.met_date = stringOrNull(input.met_date);
    if (typeof input.met_location === "string")
      update.met_location = stringOrNull(input.met_location);

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

    // Stash add_relationships for Pass 1.7 — same reason as create.
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
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (error) {
      return NextResponse.json(
        { error: `update_person: ${error.message}`, commits },
        { status: 500 },
      );
    }
    commits.people += 1;

    // V3-Sync (0030): die ADD-Tranchen parallel in die strukturierten
    // Tabellen schreiben. Existierende Werte (was schon auf der Person
    // war) wurden in 0030 Migration einmalig backfilled — wir würden
    // sonst doppelt einlegen.
    if (addPhones.length || addEmails.length || addSocials.length) {
      await syncContactsToV3({
        supabase: supabase as unknown as V3SyncSupabase,
        userId: user.id,
        personId: id,
        phones: addPhones,
        emails: addEmails,
        socials: addSocials,
      });
    }
    if (addAddresses.length) {
      await syncAddressesToV3({
        supabase: supabase as unknown as V3SyncSupabase,
        userId: user.id,
        personId: id,
        addresses: addAddresses,
      });
    }
  }

  // Pass 1.7: relationships. Resolve every related_person_name against
  // newByName + DB, mirror symmetric labels, apply (read-merge-write
  // per affected person, RLS-scoped).
  if (pendingRelEdges.length > 0) {
    const resolveMap = await resolveRelatedIds({
      supabase,
      userId: user.id,
      newByName,
      rawRels: pendingRelEdges.map((e) => e.rawRel),
    });

    const directedEdges: { from: string; to: string; label: string }[] = [];
    for (const e of pendingRelEdges) {
      const lookupKey = e.rawRel.id ?? e.rawRel.name ?? "";
      const toId = resolveMap.get(lookupKey);
      if (!toId) continue;
      if (toId === e.fromPersonId) continue; // can't relate to self
      directedEdges.push({
        from: e.fromPersonId,
        to: toId,
        label: e.rawRel.label,
      });
    }

    const allEdges = mirrorSymmetric(directedEdges);
    try {
      await applyRelationshipEdges({
        supabase,
        userId: user.id,
        edges: allEdges,
      });
    } catch (err) {
      console.error("relationship apply failed", err);
      // Fall through — relationships failing shouldn't kill the whole
      // commit; the rest of the data is already in.
    }
    // V3-Sync (0030): zusätzlich in person_relationships schreiben.
    try {
      await syncRelationshipsToV3({
        supabase: supabase as unknown as V3SyncSupabase,
        userId: user.id,
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
        user_id: user.id,
        person_ids: personIds,
        type: stringOr(input.type, "voice"),
        source: "debrief",
        summary: stringOrNull(input.summary),
        sentiment: sentimentOrNull(input.sentiment),
        topics: stringArray(input.topics),
        occurred_at:
          stringOrNull(input.occurred_at) ?? new Date().toISOString(),
      });
      if (error) {
        return NextResponse.json(
          { error: `log_interaction: ${error.message}`, commits },
          { status: 500 },
        );
      }
      commits.interactions += 1;

      // Bump last_contact_at on the involved people. Filter by
      // user_id and deleted_at so a forged or tombstoned id can't be
      // touched, even if RLS weren't there.
      if (personIds.length) {
        const { error: bumpError } = await supabase
          .from("people")
          .update({ last_contact_at: new Date().toISOString() })
          .in("id", personIds)
          .eq("user_id", user.id)
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
        user_id: user.id,
        person_id: resolvePersonId(input),
        title,
        body: body ?? "",
        tags: stringArray(input.tags),
        source: "voice",
      });
      if (error) {
        return NextResponse.json(
          { error: `create_note: ${error.message}`, commits },
          { status: 500 },
        );
      }
      commits.notes += 1;
      continue;
    }

    if (call.name === "create_reminder") {
      const remindAt = stringOrNull(input.remind_at);
      const text = stringOrNull(input.text);
      if (!remindAt || !text) continue;
      const { error } = await supabase.from("reminders").insert({
        user_id: user.id,
        person_id: resolvePersonId(input),
        text,
        remind_at: remindAt,
        recurrence: recurrenceOr(input.recurrence, "once"),
        type: reminderTypeOr(input.type, "custom"),
        status: "pending",
        source: "voice",
      });
      if (error) {
        return NextResponse.json(
          { error: `create_reminder: ${error.message}`, commits },
          { status: 500 },
        );
      }
      commits.reminders += 1;
      continue;
    }

    if (call.name === "create_todo") {
      const text = stringOrNull(input.text);
      if (!text) continue;
      const { error } = await supabase.from("todos").insert({
        user_id: user.id,
        person_id: resolvePersonId(input),
        text,
        due_date: stringOrNull(input.due_date),
        priority: priorityOr(input.priority, "medium"),
        status: "open",
      });
      if (error) {
        return NextResponse.json(
          { error: `create_todo: ${error.message}`, commits },
          { status: 500 },
        );
      }
      commits.todos += 1;
      continue;
    }
  }

  revalidatePath("/people");
  revalidatePath("/inbox");

  return NextResponse.json({ ok: true, commits });
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
  return v === "check-in" || v === "birthday" || v === "promise" || v === "custom"
    ? v
    : fallback;
}

function priorityOr(v: unknown, fallback: "low" | "medium" | "high") {
  return v === "low" || v === "medium" || v === "high" ? v : fallback;
}
