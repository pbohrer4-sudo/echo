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

const PRIORITY_RING: Record<string, string> = {
  high: "bg-red-500/15 text-red-400",
  medium: "bg-neutral-800 text-neutral-300",
  low: "bg-neutral-900 text-neutral-500",
};

function fmtDue(due: string | null): { label: string; tone: string } {
  if (!due) return { label: "—", tone: "text-neutral-500" };
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return { label: due, tone: "text-neutral-500" };

  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: d.toLocaleString("de-DE", { day: "2-digit", month: "short" }), tone: "text-red-400" };
  }
  if (diffDays === 0) {
    return {
      label: d.toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      tone: "text-[#c8ff3e]",
    };
  }
  if (diffDays === 1) {
    return { label: "Morgen", tone: "text-neutral-300" };
  }
  return {
    label: d.toLocaleString("de-DE", { day: "2-digit", month: "short" }),
    tone: "text-neutral-400",
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
    <li className="flex items-start gap-4 border-b border-neutral-900 px-4 py-3 last:border-0 hover:bg-neutral-900/30">
      <button
        type="button"
        onClick={handleDone}
        disabled={pending}
        aria-label="Als erledigt markieren"
        className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-neutral-700 transition-colors hover:border-[#c8ff3e] hover:bg-[#c8ff3e]/10 disabled:opacity-50"
      />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-100">{row.text}</span>
          {row.kind === "todo" && row.priority && row.priority !== "medium" && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${PRIORITY_RING[row.priority] ?? ""}`}
            >
              {row.priority}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span className="font-mono uppercase">
            {row.kind === "reminder" ? "Reminder" : "Todo"}
          </span>
          {personName && row.person_id && (
            <Link
              href={`/people/${row.person_id}`}
              className="hover:text-[#c8ff3e]"
            >
              {personName}
            </Link>
          )}
          {row.recurrence && row.recurrence !== "once" && (
            <span>· {row.recurrence}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className={`font-mono text-xs ${due.tone}`}>{due.label}</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          aria-label="Löschen"
          className="text-xs text-neutral-600 hover:text-red-400 disabled:opacity-50"
        >
          ×
        </button>
      </div>
    </li>
  );
}
