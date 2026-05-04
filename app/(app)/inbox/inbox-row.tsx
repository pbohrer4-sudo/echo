"use client";

import Link from "next/link";
import { useTransition } from "react";
import type { InboxRow as InboxRowType } from "@/lib/inbox";
import {
  completeReminder,
  completeTodo,
  deleteReminder,
  deleteTodo,
} from "./actions";

const PRIORITY_TONE: Record<string, string> = {
  high: "border-bad/30 bg-bad/5 text-bad",
  medium: "border-rule bg-paper-2 text-ink-3",
  low: "border-rule-soft bg-paper text-ink-4",
};

function fmtDue(due: string | null): { label: string; tone: string } {
  if (!due) return { label: "—", tone: "text-ink-4" };
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return { label: due, tone: "text-ink-4" };

  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: d.toLocaleString("de-DE", { day: "2-digit", month: "short" }),
      tone: "text-bad",
    };
  }
  if (diffDays === 0) {
    return {
      label: d.toLocaleString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      tone: "text-action",
    };
  }
  if (diffDays === 1) {
    return { label: "Morgen", tone: "text-ink-2" };
  }
  return {
    label: d.toLocaleString("de-DE", { day: "2-digit", month: "short" }),
    tone: "text-ink-3",
  };
}

export function InboxRowItem({
  row,
  personName,
}: {
  row: InboxRowType;
  personName: string | null;
}) {
  const [pending, start] = useTransition();
  const due = fmtDue(row.due);

  function handleDone() {
    start(async () => {
      if (row.kind === "reminder") await completeReminder(row.id);
      else await completeTodo(row.id);
    });
  }

  function handleDelete() {
    start(async () => {
      if (row.kind === "reminder") await deleteReminder(row.id);
      else await deleteTodo(row.id);
    });
  }

  return (
    <li className="flex items-start gap-4 border-b border-rule-soft px-4 py-3 last:border-0 hover:bg-paper-2">
      <button
        type="button"
        onClick={handleDone}
        disabled={pending}
        aria-label="Als erledigt markieren"
        className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-rule transition-colors hover:border-action hover:bg-action/10 disabled:opacity-50"
      />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-ink-1">{row.text}</span>
          {row.kind === "todo" && row.priority && row.priority !== "medium" && (
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${PRIORITY_TONE[row.priority] ?? ""}`}
            >
              {row.priority}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
          <span>{row.kind === "reminder" ? "Reminder" : "Todo"}</span>
          {personName && row.person_id && (
            <Link
              href={`/people/${row.person_id}`}
              className="hover:text-action"
            >
              {personName}
            </Link>
          )}
          {row.recurrence && row.recurrence !== "once" && (
            <span>· {row.recurrence}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`font-mono text-xs tracking-wider ${due.tone}`}
        >
          {due.label}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          aria-label="Löschen"
          className="text-sm text-ink-4 transition hover:text-bad disabled:opacity-50"
        >
          ×
        </button>
      </div>
    </li>
  );
}
