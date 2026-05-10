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

export const runtime = "nodejs";

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

    const { data, error } = await supabase
      .from("people")
      .insert({
        user_id: user.id,
        name,
        company: stringOrNull(input.company),
        role: stringOrNull(input.role),
        scope: scopeOr(input.scope, "both"),
        tags: stringArray(input.tags),
        notes: stringOrNull(input.notes),
        phones,
        emails,
        addresses: parseAddresses(input.addresses),
        socials: parseSocials(input.socials),
        important_dates: parseImportantDates(input.important_dates),
        // Mirror primary phone/email so legacy code paths still work.
        phone: phones[0]?.value ?? null,
        email: emails[0]?.value ?? null,
        birthday: findBirthday(input.important_dates),
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
    if (typeof input.company === "string")
      update.company = stringOrNull(input.company);
    if (typeof input.role === "string")
      update.role = stringOrNull(input.role);
    if (typeof input.scope === "string")
      update.scope = scopeOr(input.scope, "both");
    if (typeof input.notes === "string")
      update.notes = stringOrNull(input.notes);

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

      // Bump last_interaction_at on the involved people. Filter by
      // user_id and deleted_at so a forged or tombstoned id can't be
      // touched, even if RLS weren't there.
      if (personIds.length) {
        const { error: bumpError } = await supabase
          .from("people")
          .update({ last_interaction_at: new Date().toISOString() })
          .in("id", personIds)
          .eq("user_id", user.id)
          .is("deleted_at", null);
        if (bumpError) {
          console.error("last_interaction_at bump failed", bumpError);
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
