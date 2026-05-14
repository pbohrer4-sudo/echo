"use client";

// Eine Zeile pro Signal mit inline-Reminder-Formular. Form schließt
// sich automatisch nach Submit dank Server-Action + revalidatePath.

import Link from "next/link";
import { useState } from "react";
import { TAG_CLUSTER_COLORS } from "@/lib/types";
import { createReminderFromSignal } from "./signal-actions";
import type { SignalHit } from "@/lib/signals";

interface Props {
  signal: SignalHit;
}

export function SignalCard({ signal }: Props) {
  const [open, setOpen] = useState(false);
  const colors = TAG_CLUSTER_COLORS.reminders;
  const defaultDate = signal.parsed_date ?? "";

  return (
    <li className="border-b border-rule-soft last:border-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className="inline-flex shrink-0 items-center rounded-full px-2 py-px text-[11px]"
          style={{ background: colors.bg, color: colors.fg }}
        >
          {signal.tag_name}
        </span>
        <Link
          href={`/people/${signal.person_id}`}
          className="text-sm text-ink-1 transition hover:text-action"
        >
          {signal.person_name}
        </Link>
        {signal.parsed_date && !open && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
            {signal.parsed_date}
          </span>
        )}
        {signal.note && !open && (
          <span className="truncate text-[11px] italic text-ink-4">
            {signal.note}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {signal.has_active_reminder && (
            <span
              className="font-mono text-[9px] uppercase tracking-wider text-good"
              title="Aktiver Reminder hinterlegt"
            >
              ✓ Erinnerung
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded border border-rule bg-paper px-2 py-1 text-[10px] uppercase tracking-wider text-ink-3 transition hover:border-action hover:text-action"
          >
            {open ? "Schließen" : "Erinnerung +"}
          </button>
        </div>
      </div>
      {open && (
        <form
          action={createReminderFromSignal}
          className="border-t border-rule-soft bg-paper-2 px-4 py-3"
        >
          <input type="hidden" name="signal_name" value={signal.tag_name} />
          <input type="hidden" name="person_id" value={signal.person_id} />
          <input
            type="hidden"
            name="person_name"
            value={signal.person_name}
          />
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="t-label">Datum</span>
              <input
                type="date"
                name="remind_at"
                defaultValue={defaultDate}
                required
                className="h-9 rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20"
              />
            </label>
            <label className="space-y-1">
              <span className="t-label">Wiederholung</span>
              <select
                name="recurrence"
                defaultValue={signal.parsed_date ? "yearly" : "once"}
                className="h-9 rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20"
              >
                <option value="once">Einmalig</option>
                <option value="weekly">Wöchentlich</option>
                <option value="monthly">Monatlich</option>
                <option value="yearly">Jährlich</option>
              </select>
            </label>
            <button
              type="submit"
              className="h-9 rounded border border-action bg-action px-3 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
            >
              Reminder anlegen
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 text-xs text-ink-3 transition hover:text-ink-1"
            >
              Abbrechen
            </button>
          </div>
          {signal.note && (
            <p className="mt-2 text-[11px] italic text-ink-3">
              Note: {signal.note}
            </p>
          )}
        </form>
      )}
    </li>
  );
}
