"use client";

// Signals-Liste auf der Person-Detail-Page — jetzt inline editierbar
// (Patrick 2026-06-08). Pro Zeile:
//   • Erinnerung schnell an/aus (Bell-Toggle, Default 1 Woche vorher)
//   • Signal komplett ändern (Bearbeiten → Inline-Popover: Label, Datum,
//     Erinnerung + Vorlauf)
//   • Signal löschen (×)
// Index-basiert, weil important_dates ein JSONB-Array ohne IDs ist.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DATE_LABELS,
  REMIND_LEAD_OPTIONS,
  type ImportantDate,
} from "@/lib/types";
import {
  deleteImportantDateAction,
  editImportantDateAction,
  toggleImportantDateReminderAction,
} from "./inline-section-actions";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString(
    "de-DE",
    { day: "2-digit", month: "long", year: "numeric" },
  );
}

function leadLabel(days: number): string {
  if (days <= 0) return "Erinnert · am Tag";
  if (days === 1) return "Erinnert · 1 Tag vorher";
  if (days === 7) return "Erinnert · 1 Woche vorher";
  if (days === 14) return "Erinnert · 2 Wochen vorher";
  if (days === 30) return "Erinnert · 1 Monat vorher";
  return `Erinnert · ${days} Tage vorher`;
}

export function SignalsList({
  dates,
  personId,
  editable,
  customLabels = [],
}: {
  dates: ImportantDate[];
  personId: string;
  editable: boolean;
  customLabels?: string[];
}) {
  if (dates.length === 0)
    return <p className="text-xs italic text-ink-4">Keine Daten hinterlegt.</p>;

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {dates.map((d, i) => (
          <SignalRow
            key={`${i}-${d.label}-${d.date}`}
            date={d}
            index={i}
            personId={personId}
            editable={editable}
            customLabels={customLabels}
          />
        ))}
      </ul>
      <a
        href={`/api/people/${personId}/dates.ics`}
        download
        className="inline-flex rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action"
      >
        ↓ als .ics exportieren
      </a>
    </div>
  );
}

function SignalRow({
  date,
  index,
  personId,
  editable,
  customLabels,
}: {
  date: ImportantDate;
  index: number;
  personId: string;
  editable: boolean;
  customLabels: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function toggleReminder() {
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("index", String(index));
    // an↔aus umschalten; beim Einschalten Default 1 Woche vorher.
    if (!date.remind) {
      fd.set("remind", "on");
      fd.set("remind_lead_days", String(date.remind_lead_days ?? 7));
    }
    run(() => toggleImportantDateReminderAction(fd));
  }

  function remove() {
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("index", String(index));
    run(() => deleteImportantDateAction(fd));
  }

  return (
    <li className="group flex items-center justify-between gap-3 text-sm">
      <span className="t-label w-28 shrink-0">{date.label}</span>
      <span className="flex-1 text-ink-1">{fmtDate(date.date)}</span>

      {/* Erinnerungs-Status / Schnell-Toggle */}
      {editable ? (
        <button
          type="button"
          onClick={toggleReminder}
          disabled={pending}
          title={date.remind ? "Erinnerung entfernen" : "Erinnerung hinzufügen"}
          className={`t-label whitespace-nowrap transition disabled:opacity-50 ${
            date.remind
              ? "text-action hover:text-bad"
              : "text-ink-4 opacity-0 hover:text-action group-hover:opacity-100"
          }`}
        >
          {date.remind
            ? leadLabel(date.remind_lead_days ?? 0)
            : "+ Erinnerung"}
        </button>
      ) : (
        date.remind && (
          <span className="t-label whitespace-nowrap text-action">
            {leadLabel(date.remind_lead_days ?? 0)}
          </span>
        )
      )}

      {/* Bearbeiten + Löschen — erscheinen on-hover */}
      {editable && (
        <div className="relative flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            disabled={pending}
            title="Signal bearbeiten"
            className="text-ink-4 opacity-0 transition hover:text-ink-1 group-hover:opacity-100 disabled:opacity-50"
            aria-label="Signal bearbeiten"
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            title="Signal löschen"
            className="text-ink-4 opacity-0 transition hover:text-bad group-hover:opacity-100 disabled:opacity-50"
            aria-label="Signal löschen"
          >
            ×
          </button>
          {editing && (
            <EditSignalPopover
              date={date}
              index={index}
              personId={personId}
              customLabels={customLabels}
              pending={pending}
              onSubmit={(fd) => run(() => editImportantDateAction(fd))}
              onCancel={() => setEditing(false)}
            />
          )}
        </div>
      )}
    </li>
  );
}

function EditSignalPopover({
  date,
  index,
  personId,
  customLabels,
  pending,
  onSubmit,
  onCancel,
}: {
  date: ImportantDate;
  index: number;
  personId: string;
  customLabels: string[];
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  const occasions = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of [...DATE_LABELS, ...customLabels, date.label]) {
      const key = l.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(l);
    }
    return out;
  })();

  const [label, setLabel] = useState<string>(date.label);
  const [customLabel, setCustomLabel] = useState(
    occasions.includes(date.label) ? "" : date.label,
  );
  const [dateVal, setDateVal] = useState(date.date);
  const [remind, setRemind] = useState(date.remind);
  const [lead, setLead] = useState(date.remind_lead_days ?? 7);
  const ref = useRef<HTMLFormElement>(null);

  function submit() {
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("index", String(index));
    fd.set("label", label === "andere" ? customLabel.trim() : label);
    fd.set("date", dateVal);
    if (remind) {
      fd.set("remind", "on");
      fd.set("remind_lead_days", String(lead));
    }
    onSubmit(fd);
  }

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="absolute right-0 top-full z-50 mt-1 w-72 space-y-2 rounded border border-rule bg-paper p-3 shadow-[0_4px_14px_rgba(20,17,13,0.08)]"
    >
      <label className="block space-y-1">
        <span className="t-label">Anlass</span>
        <select
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-9 w-full rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20"
        >
          {occasions.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {label === "andere" && (
        <input
          type="text"
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          placeholder="Eigener Anlass"
          className="h-9 w-full rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20"
        />
      )}
      <label className="block space-y-1">
        <span className="t-label">Datum</span>
        <input
          type="date"
          value={dateVal}
          onChange={(e) => setDateVal(e.target.value)}
          className="h-9 w-full rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20"
        />
      </label>
      <label className="flex items-center gap-2 text-[11px] text-ink-2">
        <input
          type="checkbox"
          checked={remind}
          onChange={(e) => setRemind(e.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--action)]"
        />
        Erinnerung
      </label>
      {remind && (
        <label className="block space-y-1">
          <span className="t-label">Vorlauf</span>
          <select
            value={lead}
            onChange={(e) => setLead(parseInt(e.target.value, 10))}
            className="h-9 w-full rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20"
          >
            {REMIND_LEAD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] text-ink-3 transition hover:text-ink-1"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={pending || !dateVal || (label === "andere" && !customLabel.trim())}
          className="rounded border border-action bg-action px-3 py-1 text-[10px] font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
        >
          {pending ? "…" : "Speichern"}
        </button>
      </div>
    </form>
  );
}

function PencilIcon() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
