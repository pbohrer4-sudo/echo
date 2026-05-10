import { createClient } from "@/lib/supabase/server";
import type { Reminder, Todo, Interaction, Note } from "@/lib/types";

// Count of reminders that are due NOW or earlier and still pending.
// Used by the sidebar nav to render the "Reminders" badge — keeps
// the nudge visible until the user actually finalizes them.
export async function countOverdueReminders(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("reminders")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lte("remind_at", new Date().toISOString());
  return count ?? 0;
}

export interface InboxRow {
  kind: "reminder" | "todo";
  id: string;
  text: string;
  due: string | null;
  person_id: string | null;
  recurrence?: string;
  reminderType?: string;
  priority?: string;
}

// Open reminders + todos for the current user, sorted by date (overdue
// first, then chronological, then no-date items at the end).
export async function listInbox(): Promise<InboxRow[]> {
  const supabase = await createClient();

  const [remRes, todoRes] = await Promise.all([
    supabase
      .from("reminders")
      .select("*")
      .eq("status", "pending")
      .order("remind_at", { ascending: true }),
    supabase
      .from("todos")
      .select("*")
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false }),
  ]);

  if (remRes.error) throw remRes.error;
  if (todoRes.error) throw todoRes.error;

  const reminderRows: InboxRow[] = (remRes.data as Reminder[]).map((r) => ({
    kind: "reminder",
    id: r.id,
    text: r.text,
    due: r.remind_at,
    person_id: r.person_id,
    recurrence: r.recurrence,
    reminderType: r.type,
  }));

  const todoRows: InboxRow[] = (todoRes.data as Todo[]).map((t) => ({
    kind: "todo",
    id: t.id,
    text: t.text,
    due: t.due_date,
    person_id: t.person_id,
    priority: t.priority,
  }));

  const all = [...reminderRows, ...todoRows];
  all.sort((a, b) => {
    if (a.due === null && b.due === null) return 0;
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return a.due.localeCompare(b.due);
  });

  return all;
}

export async function listRemindersForPerson(
  personId: string,
): Promise<Reminder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("person_id", personId)
    .order("remind_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Reminder[];
}

export async function listTodosForPerson(personId: string): Promise<Todo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("person_id", personId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Todo[];
}

export async function listInteractionsForPerson(
  personId: string,
): Promise<Interaction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interactions")
    .select("*")
    .contains("person_ids", [personId])
    .order("occurred_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Interaction[];
}

export async function listNotesForPerson(personId: string): Promise<Note[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Note[];
}

// Map of person id → name for inbox rendering. Cheap one-shot lookup.
export async function getPeopleMap(
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("id, name")
    .in("id", ids);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const p of data ?? []) map[p.id] = p.name;
  return map;
}
