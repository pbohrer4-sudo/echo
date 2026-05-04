import type { ReminderRecurrence } from "@/lib/types";

// Returns the next ISO timestamp for a recurring reminder, or null if
// the reminder is one-shot. The advance is anchored on the original
// remind_at (not "now") so a reminder fired late doesn't drift.
export function nextRemindAt(
  remindAt: string,
  recurrence: ReminderRecurrence,
): string | null {
  if (recurrence === "once") return null;

  const date = new Date(remindAt);
  if (Number.isNaN(date.getTime())) return null;

  // Step forward by one unit, then if that's still in the past, keep
  // stepping until we're in the future. Prevents a backlog of "next
  // occurrences" all in the past after a long gap.
  const now = Date.now();
  do {
    advance(date, recurrence);
  } while (date.getTime() <= now);

  return date.toISOString();
}

function advance(date: Date, recurrence: ReminderRecurrence) {
  switch (recurrence) {
    case "weekly":
      date.setDate(date.getDate() + 7);
      return;
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      return;
    case "yearly":
      date.setFullYear(date.getFullYear() + 1);
      return;
    case "once":
      return;
  }
}
