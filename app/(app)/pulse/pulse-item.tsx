"use client";

// Generisches Pulse-Item — eine Zeile mit Titel + Subline + Quick-Actions.
// Wird von allen vier Sektionen wiederverwendet (Stale-Person, Birthday,
// Reminder, Todo) — Variante steuert welche Actions verfügbar sind.

import Link from "next/link";
import { useTransition } from "react";
import {
  markReminderDoneAction,
  markTodoDoneAction,
  snoozePersonAction,
  snoozeReminderAction,
  snoozeTodoAction,
} from "./pulse-actions";

export type PulseItemKind =
  | "stale_person"
  | "birthday"
  | "reminder"
  | "todo";

interface Props {
  kind: PulseItemKind;
  id: string;             // person_id für stale/birthday, reminder/todo id sonst
  personId?: string | null; // für birthday → link auf Detail
  personPhone?: string | null; // für Draft-Action
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  badge?: React.ReactNode;
}

function normalizeForWaMe(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export function PulseItem({
  kind,
  id,
  personId,
  personPhone,
  primary,
  secondary,
  badge,
}: Props) {
  const [pending, startTransition] = useTransition();

  function snooze(days: number) {
    startTransition(async () => {
      if (kind === "stale_person") {
        await snoozePersonAction(id, days);
      } else if (kind === "reminder") {
        await snoozeReminderAction(id, days);
      } else if (kind === "todo") {
        await snoozeTodoAction(id, days);
      }
    });
  }

  function markDone() {
    startTransition(async () => {
      if (kind === "reminder") await markReminderDoneAction(id);
      else if (kind === "todo") await markTodoDoneAction(id);
    });
  }

  const draftHref = personPhone
    ? `https://wa.me/${normalizeForWaMe(personPhone)}`
    : undefined;

  // Welche Actions zeigt das Item?
  const showDraft = kind === "stale_person" || kind === "birthday";
  const showSnooze = kind !== "birthday"; // Birthdays sind kalender-fix
  const showDone = kind === "reminder" || kind === "todo";

  return (
    <li
      className={`group flex items-start justify-between gap-3 border-b border-rule-soft px-4 py-3 last:border-0 ${
        pending ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline gap-2">
          {personId ? (
            <Link
              href={`/people/${personId}`}
              className="text-sm font-medium text-ink-1 transition hover:text-action"
            >
              {primary}
            </Link>
          ) : (
            <span className="text-sm font-medium text-ink-1">{primary}</span>
          )}
          {badge && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-4">
              {badge}
            </span>
          )}
        </div>
        {secondary && (
          <div className="text-xs text-ink-3">{secondary}</div>
        )}
      </div>

      {/* Actions — auf Desktop on-hover sichtbar, Mobile immer. */}
      <div className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
        {showDraft && draftHref && (
          <a
            href={draftHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-rule bg-paper px-2 py-1 text-[10px] uppercase tracking-wider text-ink-3 transition hover:border-[#25D366] hover:text-[#25D366]"
            title="WhatsApp öffnen"
          >
            Draft
          </a>
        )}
        {showSnooze && (
          <>
            <button
              type="button"
              onClick={() => snooze(7)}
              disabled={pending}
              className="rounded border border-rule bg-paper px-2 py-1 text-[10px] uppercase tracking-wider text-ink-3 transition hover:border-action hover:text-action disabled:opacity-30"
              title="In 7 Tagen wieder zeigen"
            >
              +1W
            </button>
            <button
              type="button"
              onClick={() => snooze(30)}
              disabled={pending}
              className="rounded border border-rule bg-paper px-2 py-1 text-[10px] uppercase tracking-wider text-ink-3 transition hover:border-action hover:text-action disabled:opacity-30"
              title="In 30 Tagen wieder zeigen"
            >
              +1M
            </button>
          </>
        )}
        {showDone && (
          <button
            type="button"
            onClick={markDone}
            disabled={pending}
            className="rounded border border-rule bg-paper px-2 py-1 text-[10px] uppercase tracking-wider text-ink-3 transition hover:border-good hover:text-good disabled:opacity-30"
            title="Als erledigt markieren"
          >
            ✓
          </button>
        )}
      </div>
    </li>
  );
}
