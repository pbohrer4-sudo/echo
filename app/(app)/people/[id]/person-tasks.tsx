"use client";

import { useTransition } from "react";
import {
  completeReminder,
  completeTodo,
  deleteReminder,
  deleteTodo,
} from "../../inbox/actions";
import type { Reminder, Todo } from "@/lib/types";

function fmtRemindAt(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDueDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export function PersonReminders({ reminders }: { reminders: Reminder[] }) {
  if (reminders.length === 0) {
    return <p className="text-sm italic text-ink-3">Keine Erinnerungen.</p>;
  }
  return (
    <ul className="space-y-3">
      {reminders.map((r) => (
        <ReminderRow key={r.id} reminder={r} />
      ))}
    </ul>
  );
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const [pending, start] = useTransition();
  const isOpen = reminder.status === "pending";

  return (
    <li className="flex items-start gap-3 text-sm">
      <button
        type="button"
        disabled={pending || !isOpen}
        onClick={() => start(async () => completeReminder(reminder.id))}
        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border transition-colors ${
          isOpen
            ? "border-rule hover:border-action"
            : "border-action bg-action"
        } disabled:opacity-50`}
        aria-label={isOpen ? "Als erledigt markieren" : "Erledigt"}
      />
      <div className="min-w-0 flex-1">
        <p
          className={
            isOpen
              ? "text-ink-1"
              : "text-ink-3 line-through"
          }
        >
          {reminder.text}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-4">
          {fmtRemindAt(reminder.remind_at)}
          {reminder.recurrence !== "once" && ` · ${reminder.recurrence}`}
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => deleteReminder(reminder.id))}
        className="text-sm text-ink-4 transition hover:text-bad disabled:opacity-50"
        aria-label="Löschen"
      >
        ×
      </button>
    </li>
  );
}

export function PersonTodos({ todos }: { todos: Todo[] }) {
  if (todos.length === 0) {
    return <p className="text-sm italic text-ink-3">Keine Aufgaben.</p>;
  }
  return (
    <ul className="space-y-3">
      {todos.map((t) => (
        <TodoRow key={t.id} todo={t} />
      ))}
    </ul>
  );
}

function TodoRow({ todo }: { todo: Todo }) {
  const [pending, start] = useTransition();
  const isOpen = todo.status === "open";

  return (
    <li className="flex items-start gap-3 text-sm">
      <button
        type="button"
        disabled={pending || !isOpen}
        onClick={() => start(async () => completeTodo(todo.id))}
        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border transition-colors ${
          isOpen
            ? "border-rule hover:border-action"
            : "border-action bg-action"
        } disabled:opacity-50`}
        aria-label={isOpen ? "Als erledigt markieren" : "Erledigt"}
      />
      <div className="min-w-0 flex-1">
        <p
          className={
            isOpen
              ? "text-ink-1"
              : "text-ink-3 line-through"
          }
        >
          {todo.text}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-4">
          {fmtDueDate(todo.due_date)}
          {todo.priority !== "medium" && ` · ${todo.priority}`}
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => deleteTodo(todo.id))}
        className="text-sm text-ink-4 transition hover:text-bad disabled:opacity-50"
        aria-label="Löschen"
      >
        ×
      </button>
    </li>
  );
}
