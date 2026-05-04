import { createClient } from "@/lib/supabase/server";

export interface DebriefContext {
  interactionsToday: number;
  dueRemindersToday: number;
}

// Snapshot of "what happened today" for the greeting line.
export async function getDebriefContext(): Promise<DebriefContext> {
  const supabase = await createClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [interactionsRes, remindersRes] = await Promise.all([
    supabase
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", startOfDay.toISOString())
      .lte("occurred_at", endOfDay.toISOString()),
    supabase
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("remind_at", endOfDay.toISOString()),
  ]);

  return {
    interactionsToday: interactionsRes.count ?? 0,
    dueRemindersToday: remindersRes.count ?? 0,
  };
}

// Counts consecutive days of completed debriefs ending today (or
// yesterday if today isn't done yet — today's slot remains open until
// the day actually ends, so we don't break the streak prematurely).
// Returns 0 if the most recent debrief is older than yesterday.
export async function getDebriefStreak(): Promise<{
  current: number;
  longest: number;
  doneToday: boolean;
}> {
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 365);

  const { data, error } = await supabase
    .from("debriefs")
    .select("date")
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: false });

  if (error) throw error;

  const dates = new Set<string>(
    (data ?? []).map((r) => (r as { date: string }).date),
  );
  if (dates.size === 0) return { current: 0, longest: 0, doneToday: false };

  const today = new Date();
  const todayStr = isoDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const doneToday = dates.has(todayStr);

  // Walk back from today (or yesterday if today not done) until a gap.
  let current = 0;
  const cursor = new Date(doneToday ? today : yesterday);
  while (dates.has(isoDate(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Longest streak in the last year. Sort sorted dates ascending and
  // sweep.
  const sorted = Array.from(dates).sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const s of sorted) {
    const d = new Date(s);
    if (prev && (d.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = d;
  }

  return { current, longest, doneToday };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
