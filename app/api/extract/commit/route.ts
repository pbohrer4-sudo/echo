import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ToolCall } from "@/lib/tools";

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

  for (const call of calls) {
    if (call.name !== "create_person") continue;
    const input = call.input as Record<string, unknown>;
    const name = String(input.name ?? "").trim();
    if (!name) continue;

    const { data, error } = await supabase
      .from("people")
      .insert({
        user_id: user.id,
        name,
        company: stringOrNull(input.company),
        role: stringOrNull(input.role),
        scope: scopeOr(input.scope, "both"),
        tags: stringArray(input.tags),
      })
      .select("id, name")
      .single();

    if (error) {
      return NextResponse.json(
        { error: `create_person: ${error.message}`, commits },
        { status: 500 },
      );
    }
    newByName.set(name.toLowerCase(), data.id);
    commits.people += 1;
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

      // Bump last_interaction_at on the involved people.
      if (personIds.length) {
        await supabase
          .from("people")
          .update({ last_interaction_at: new Date().toISOString() })
          .in("id", personIds);
      }
      continue;
    }

    if (call.name === "create_note") {
      const { error } = await supabase.from("notes").insert({
        user_id: user.id,
        person_id: resolvePersonId(input),
        title: stringOrNull(input.title),
        body: stringOrNull(input.body) ?? "",
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
      if (!remindAt) continue;
      const { error } = await supabase.from("reminders").insert({
        user_id: user.id,
        person_id: resolvePersonId(input),
        text: stringOrNull(input.text) ?? "",
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
      const { error } = await supabase.from("todos").insert({
        user_id: user.id,
        person_id: resolvePersonId(input),
        text: stringOrNull(input.text) ?? "",
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

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function stringOr(v: unknown, fallback: string): string {
  return stringOrNull(v) ?? fallback;
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
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
