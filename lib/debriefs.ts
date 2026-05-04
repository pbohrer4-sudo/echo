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
