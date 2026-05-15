import { createClient } from "@/lib/supabase/server";
import type {
  Reminder,
  ReminderRecurrence,
  Todo,
  Interaction,
  Note,
} from "@/lib/types";

// Recurring reminders speichern den ORIGINAL-Termin (z.B. 2019-06-22
// für Hochzeitstag) — sie werden nie mutiert. „Wann fällt der nächste
// Trigger an" muss daher zur Lese-Zeit gerechnet werden, sonst gilt
// jeder Geburtstag aus der Vergangenheit als „überfällig".
export function nextOccurrence(
  remindAt: string,
  recurrence: ReminderRecurrence,
  now: Date = new Date(),
): string {
  const base = new Date(remindAt);
  if (Number.isNaN(base.getTime())) return remindAt;
  if (recurrence === "once") return remindAt;
  if (base.getTime() >= now.getTime()) return remindAt;

  if (recurrence === "yearly") {
    const next = new Date(base);
    next.setFullYear(now.getFullYear());
    if (next.getTime() < now.getTime()) {
      next.setFullYear(now.getFullYear() + 1);
    }
    return next.toISOString();
  }
  if (recurrence === "monthly") {
    const next = new Date(base);
    while (next.getTime() < now.getTime()) {
      next.setMonth(next.getMonth() + 1);
    }
    return next.toISOString();
  }
  if (recurrence === "weekly") {
    const next = new Date(base);
    const week = 7 * 24 * 60 * 60 * 1000;
    while (next.getTime() < now.getTime()) {
      next.setTime(next.getTime() + week);
    }
    return next.toISOString();
  }
  return remindAt;
}

// Count of reminders that are due NOW or earlier and still pending —
// nach Recurrence-Rollover gerechnet, sonst zählen Geburtstage aus der
// Vergangenheit für immer als überfällig. Wir holen alle pending Rows
// + filtern clientseitig; das ist OK weil die Tabelle pro User klein
// bleibt (Reminders sind aktiv, nicht ein Audit-Log).
export async function countOverdueReminders(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reminders")
    .select("remind_at, recurrence")
    .eq("status", "pending");
  if (!data) return 0;
  const now = new Date();
  let count = 0;
  for (const r of data as { remind_at: string; recurrence: ReminderRecurrence }[]) {
    const next = nextOccurrence(r.remind_at, r.recurrence, now);
    if (new Date(next).getTime() <= now.getTime()) count += 1;
  }
  return count;
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

  const now = new Date();
  const reminderRows: InboxRow[] = (remRes.data as Reminder[]).map((r) => ({
    kind: "reminder",
    id: r.id,
    text: r.text,
    // Für recurring Reminders ist `remind_at` der Original-Tag — wir
    // rollen auf das nächste Vorkommen damit „heute überfällig" auch
    // wirklich heute heißt und nicht „seit 2019".
    due: nextOccurrence(r.remind_at, r.recurrence, now),
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
