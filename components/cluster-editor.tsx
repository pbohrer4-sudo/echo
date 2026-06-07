"use client";

import Link from "next/link";

// Cluster-Editor (Phase C6 + 0028 Notes).
//
// Drei Subsections auf der Person-Detail-Page:
//   1. Tags (gruppiert nach 4 Cluster: Reminders, Interests, Potential, Origin)
//   2. Passions (eigene Tabelle, max 5)
//   3. Circles (eigene Tabelle, Communities/Organisationen)
//
// Jedes Pill kann eine Person-spezifische Note tragen (0028). Pills
// ohne Note zeigen on-hover ein „+" zum Anlegen; mit Note zeigt sich
// ein dauerhaftes „i", Hover gibt die Note als Tooltip, Klick öffnet
// den Editor. Plus klassisches Entfernen via × bleibt.

import { useEffect, useRef, useState, useTransition } from "react";
import {
  CIRCLE_HINT,
  CIRCLE_COLOR,
  PASSION_COLOR,
  PASSION_HINT,
  TAG_CLUSTER_COLORS,
  TAG_CLUSTER_HINTS,
  TAG_CLUSTER_LABELS,
  type CircleRow,
  type CircleWithNote,
  type PassionRow,
  type TagCluster,
  type TagWithNote,
} from "@/lib/types";
import { InfoTooltip } from "@/components/info-tooltip";
import {
  addPersonTag,
  removePersonTag,
  addPersonPassion,
  removePersonPassion,
  addPersonCircle,
  removePersonCircle,
  updateTagNote,
  updatePassionNote,
  updateCircleNote,
} from "@/app/(app)/people/[id]/cluster-actions";
import { createSignalReminders } from "@/app/(app)/heute/signal-actions";

interface Props {
  personId: string;
  personName: string;
  tags: TagWithNote[];
  passions: PassionRow[];
  personCircles: CircleWithNote[];
  allCircles: CircleRow[];
}

// Signals (reminders cluster) is rendered as its own row UNDER Circles
// (Patrick 2026-06-07 — it felt too similar to "Wichtige Daten" inside
// the Tags grid). The Tags grid now only holds the non-time clusters.
const CLUSTER_ORDER: TagCluster[] = ["interests", "potential", "origin"];

export function ClusterEditor({
  personId,
  personName,
  tags,
  passions,
  personCircles,
  allCircles,
}: Props) {
  // The 7-tag limit counts ALL tags including Signals/reminders, so it's
  // computed here and shared with both the Tags grid and the standalone
  // Signals row.
  const atLimit = tags.length >= 7;
  const reminderTags = tags.filter((t) => t.cluster === "reminders");

  return (
    <div className="space-y-4">
      <TagsBlock personId={personId} personName={personName} tags={tags} />
      <PassionsBlock personId={personId} passions={passions} />
      <CirclesBlock
        personId={personId}
        personCircles={personCircles}
        allCircles={allCircles}
      />
      {/* Signals — eigene Zeile direkt unter Circles. */}
      <section className="space-y-3">
        <TagClusterRow
          cluster="reminders"
          tags={reminderTags}
          personId={personId}
          personName={personName}
          disabled={atLimit}
        />
      </section>
    </div>
  );
}

// ───────────── TAGS ─────────────

function TagsBlock({
  personId,
  personName,
  tags,
}: {
  personId: string;
  personName: string;
  tags: TagWithNote[];
}) {
  const grouped = new Map<TagCluster, TagWithNote[]>();
  for (const c of CLUSTER_ORDER) grouped.set(c, []);
  for (const t of tags) {
    grouped.get(t.cluster)?.push(t);
  }

  const totalCount = tags.length;
  const atLimit = totalCount >= 7;

  return (
    <section className="space-y-3">
      <div className="section-head">
        <span className="t-label">Tags ({totalCount}/7)</span>
        <span className="rule" />
      </div>
      {/* 2×2-Grid: Signals + Interests links, Potential + Origin
          rechts. Spart Höhe, jede Spalte kann eigene Pills wrap'en. */}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {CLUSTER_ORDER.map((cluster) => (
          <TagClusterRow
            key={cluster}
            cluster={cluster}
            tags={grouped.get(cluster) ?? []}
            personId={personId}
            personName={personName}
            disabled={atLimit}
          />
        ))}
      </div>
      {atLimit && (
        <p className="text-[10px] uppercase tracking-wider text-ink-4">
          7-Tag-Limit erreicht — erst einen entfernen
        </p>
      )}
    </section>
  );
}

function TagClusterRow({
  cluster,
  tags,
  personId,
  personName,
  disabled,
}: {
  cluster: TagCluster;
  tags: TagWithNote[];
  personId: string;
  personName: string;
  disabled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commitAdd() {
    const name = input.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    startTransition(async () => {
      const res = await addPersonTag(personId, name, cluster);
      if (!res.ok) {
        setError(res.error ?? "Fehler");
      } else {
        setInput("");
        setAdding(false);
        setError(null);
      }
    });
  }

  function commitRemove(tagId: string) {
    startTransition(async () => {
      await removePersonTag(personId, tagId);
    });
  }

  function commitNote(tagId: string, note: string | null) {
    startTransition(async () => {
      await updateTagNote(personId, tagId, note);
    });
  }

  const colors = TAG_CLUSTER_COLORS[cluster];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span
          className="t-label inline-flex items-center gap-1.5"
          style={{ color: colors.fg }}
        >
          {TAG_CLUSTER_LABELS[cluster]}
          <InfoTooltip text={TAG_CLUSTER_HINTS[cluster]} />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length === 0 && !adding && (
          <span className="text-[11px] italic text-ink-4">—</span>
        )}
        {tags.map((t) => (
          <PillWithNote
            key={t.id}
            label={t.name}
            note={t.note}
            bg={colors.bg}
            fg={colors.fg}
            onRemove={() => commitRemove(t.id)}
            onNoteChange={(n) => commitNote(t.id, n)}
            disabled={pending}
            href={`/people?tag=${encodeURIComponent(t.name)}`}
            signalContext={
              cluster === "reminders"
                ? { personId, personName, signalName: t.name }
                : undefined
            }
          />
        ))}
        {adding && (
          <InlineAddInput
            value={input}
            onChange={setInput}
            onCommit={commitAdd}
            onCancel={() => {
              setAdding(false);
              setInput("");
              setError(null);
            }}
            placeholder={`+ ${TAG_CLUSTER_LABELS[cluster]}-Tag`}
            bg={colors.bg}
            fg={colors.fg}
            pending={pending}
          />
        )}
        {!adding && !disabled && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center rounded-full border border-dashed px-2 py-px text-[10px] leading-snug transition hover:border-solid"
            style={{ borderColor: colors.fg, color: colors.fg }}
            title={`${TAG_CLUSTER_LABELS[cluster]} hinzufügen`}
          >
            + Tag
          </button>
        )}
      </div>
      {error && <p className="text-[10px] text-bad">{error}</p>}
    </div>
  );
}

// ───────────── PASSIONS ─────────────

function PassionsBlock({
  personId,
  passions,
}: {
  personId: string;
  passions: PassionRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const atLimit = passions.length >= 5;

  function commitAdd() {
    const name = input.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    startTransition(async () => {
      const res = await addPersonPassion(personId, name);
      if (!res.ok) {
        setError(res.error ?? "Fehler");
      } else {
        setInput("");
        setAdding(false);
        setError(null);
      }
    });
  }

  function commitRemove(id: string) {
    startTransition(async () => {
      await removePersonPassion(personId, id);
    });
  }

  function commitNote(id: string, note: string | null) {
    startTransition(async () => {
      await updatePassionNote(personId, id, note);
    });
  }

  return (
    <section className="space-y-3">
      <div className="section-head">
        <span className="t-label inline-flex items-center gap-1.5">
          Passions ({passions.length}/5)
          <InfoTooltip text={PASSION_HINT} />
        </span>
        <span className="rule" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {passions.length === 0 && !adding && (
          <span className="text-[11px] italic text-ink-4">
            Identitätsstiftende Interessen — max 5
          </span>
        )}
        {passions.map((p) => (
          <PillWithNote
            key={p.id}
            label={p.name}
            note={p.note}
            bg={PASSION_COLOR.bg}
            fg={PASSION_COLOR.fg}
            onRemove={() => commitRemove(p.id)}
            onNoteChange={(n) => commitNote(p.id, n)}
            disabled={pending}
            href={`/people?passion=${encodeURIComponent(p.name.toLowerCase())}`}
          />
        ))}
        {adding && (
          <InlineAddInput
            value={input}
            onChange={setInput}
            onCommit={commitAdd}
            onCancel={() => {
              setAdding(false);
              setInput("");
              setError(null);
            }}
            placeholder="+ Passion (z.B. Klassik)"
            bg={PASSION_COLOR.bg}
            fg={PASSION_COLOR.fg}
            pending={pending}
          />
        )}
        {!adding && !atLimit && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-rule px-2.5 py-1 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
          >
            + Passion
          </button>
        )}
      </div>
      {atLimit && !adding && (
        <p className="text-[10px] uppercase tracking-wider text-ink-4">
          5-Passion-Limit erreicht
        </p>
      )}
      {error && <p className="text-[10px] text-bad">{error}</p>}
    </section>
  );
}

// ───────────── CIRCLES ─────────────

function CirclesBlock({
  personId,
  personCircles,
  allCircles,
}: {
  personId: string;
  personCircles: CircleWithNote[];
  allCircles: CircleRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const memberIds = new Set(personCircles.map((c) => c.id));
  const candidates = allCircles.filter((c) => !memberIds.has(c.id));
  const inputLower = input.trim().toLowerCase();
  const suggestions = inputLower
    ? candidates.filter((c) => c.name.toLowerCase().includes(inputLower))
    : candidates;

  function commitAdd(name?: string) {
    const target = (name ?? input).trim();
    if (!target) {
      setAdding(false);
      return;
    }
    startTransition(async () => {
      const res = await addPersonCircle(personId, target);
      if (!res.ok) {
        setError(res.error ?? "Fehler");
      } else {
        setInput("");
        setAdding(false);
        setError(null);
      }
    });
  }

  function commitRemove(id: string) {
    startTransition(async () => {
      await removePersonCircle(personId, id);
    });
  }

  function commitNote(id: string, note: string | null) {
    startTransition(async () => {
      await updateCircleNote(personId, id, note);
    });
  }

  return (
    <section className="space-y-3">
      <div className="section-head">
        <span className="t-label inline-flex items-center gap-1.5">
          Circles
          <InfoTooltip text={CIRCLE_HINT} />
        </span>
        <span className="rule" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {personCircles.length === 0 && !adding && (
          <span className="text-[11px] italic text-ink-4">
            Communities / Organisationen
          </span>
        )}
        {personCircles.map((c) => (
          <PillWithNote
            key={c.id}
            label={c.name}
            note={c.note}
            bg={CIRCLE_COLOR.bg}
            fg={CIRCLE_COLOR.fg}
            onRemove={() => commitRemove(c.id)}
            onNoteChange={(n) => commitNote(c.id, n)}
            disabled={pending}
            href={`/people?circle=${encodeURIComponent(c.name)}`}
          />
        ))}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-rule px-2.5 py-1 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
          >
            + Circle
          </button>
        )}
      </div>
      {adding && (
        <div className="relative space-y-1.5">
          <div className="flex items-center gap-1.5">
            <InlineAddInput
              value={input}
              onChange={setInput}
              onCommit={() => commitAdd()}
              onCancel={() => {
                setAdding(false);
                setInput("");
                setError(null);
              }}
              placeholder="Bestehender Circle oder neuer Name…"
              bg={CIRCLE_COLOR.bg}
              fg={CIRCLE_COLOR.fg}
              pending={pending}
              widerInput
            />
          </div>
          {suggestions.length > 0 && (
            <ul className="rounded border border-rule bg-paper overflow-hidden">
              {suggestions.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => commitAdd(c.name)}
                    disabled={pending}
                    className="block w-full px-3 py-1.5 text-left text-xs text-ink-1 transition hover:bg-paper-2 disabled:opacity-50"
                  >
                    {c.name}
                    {c.description && (
                      <span className="ml-2 text-ink-4">· {c.description}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-[10px] text-bad">{error}</p>}
    </section>
  );
}

// ───────────── SHARED PRIMITIVES ─────────────

// Pill mit optionaler Person-Note (0028).
// - Note vorhanden  → permanentes „i"-Icon, Hover zeigt Tooltip, Klick öffnet Editor
// - Keine Note     → „+"-Icon erscheint nur on-hover, Klick öffnet leeren Editor
// - × bleibt rechts dahinter zum Entfernen
function PillWithNote({
  label,
  note,
  bg,
  fg,
  onRemove,
  onNoteChange,
  disabled,
  href,
  signalContext,
}: {
  label: string;
  note: string | null;
  bg: string;
  fg: string;
  onRemove: () => void;
  onNoteChange: (note: string | null) => void;
  disabled: boolean;
  // Optional — wenn gesetzt wird der Label-Text zum Link.
  // Geht typischerweise auf /people?tag=... bzw. /people?passion=...
  // /people?circle=... damit Klick die Liste filtert.
  href?: string;
  // Für Signal-Cluster-Pills: aktiviert die Reminder-Anlage im Popover.
  // Wird nur von der Reminders/Signals-Sektion durchgereicht.
  signalContext?: {
    personId: string;
    personName: string;
    signalName: string;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const hasNote = (note ?? "").trim().length > 0;

  useEffect(() => {
    setDraft(note ?? "");
  }, [note]);

  // Click-outside zum Schließen des Editors.
  useEffect(() => {
    if (!editing) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (pillRef.current?.contains(t)) return;
      // Beim Schließen ohne Enter trotzdem speichern (autosave-on-blur).
      commitNote();
      setEditing(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft]);

  function commitNote() {
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if (next !== (note ?? null)) onNoteChange(next);
  }

  function openEditor() {
    setTooltipOpen(false);
    setEditing(true);
  }

  return (
    <span
      ref={pillRef}
      className="group relative inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
      style={{ background: bg, color: fg }}
      onMouseEnter={() => {
        if (hasNote && !editing) setTooltipOpen(true);
      }}
      onMouseLeave={() => setTooltipOpen(false)}
    >
      {href ? (
        <Link
          href={href}
          className="transition hover:underline"
          style={{ color: fg }}
          title={`Personen mit „${label}" zeigen`}
        >
          {label}
        </Link>
      ) : (
        <span>{label}</span>
      )}

      {/* Info/Add Glyph — klein, dezent. „i" wenn Note vorhanden,
          sonst „+" das nur on-hover erscheint. */}
      <button
        type="button"
        onClick={openEditor}
        disabled={disabled}
        aria-label={hasNote ? `Note für ${label} bearbeiten` : `Note für ${label} hinzufügen`}
        title={hasNote ? "Note ansehen" : "Note hinzufügen"}
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold leading-none transition ${
          hasNote
            ? "opacity-80 hover:opacity-100"
            : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
        } disabled:cursor-not-allowed disabled:opacity-20`}
        style={{
          background: hasNote ? fg : "transparent",
          color: hasNote ? bg : fg,
          border: hasNote ? "none" : `1px solid ${fg}`,
        }}
      >
        {hasNote ? "i" : "+"}
      </button>

      {/* Remove × — wie bisher */}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`${label} entfernen`}
        className="rounded-full leading-none opacity-40 transition hover:opacity-100 disabled:opacity-20"
        style={{ color: fg }}
      >
        ×
      </button>

      {/* Hover-Tooltip (read-only Vorschau) */}
      {hasNote && tooltipOpen && !editing && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-40 mt-1 max-w-xs -translate-x-1/2 whitespace-pre-wrap rounded border border-rule bg-paper px-2.5 py-1.5 text-[11px] leading-snug text-ink-2 shadow-[0_4px_14px_rgba(20,17,13,0.08)]"
        >
          {note}
        </span>
      )}

      {/* Inline-Editor — Popover unter dem Pill.
          Für Signal-Pills: nur Reminder-Formular, keine Note (Reminder
          ist der eigentliche Wert, freie Notes lenken vom Fokus ab).
          Andere Pills (Interests/Potential/Origin/Passions/Circles):
          Note-Editor wie bisher. */}
      {editing && (
        <div
          ref={popoverRef}
          className={`absolute left-0 top-full z-50 mt-1 rounded border border-rule bg-paper p-2 shadow-[0_4px_14px_rgba(20,17,13,0.08)] ${
            signalContext ? "w-80" : "w-64"
          }`}
        >
          {signalContext ? (
            <SignalReminderSection
              personId={signalContext.personId}
              personName={signalContext.personName}
              signalName={signalContext.signalName}
              onClose={() => setEditing(false)}
            />
          ) : (
            <>
              <div className="t-label mb-1.5 text-ink-4">Note · {label}</div>
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    commitNote();
                    setEditing(false);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setDraft(note ?? "");
                    setEditing(false);
                  }
                }}
                rows={3}
                placeholder="Was bedeutet das hier speziell für diese Person?"
                className="w-full resize-none rounded border border-rule bg-paper px-2 py-1.5 text-xs text-ink-1 outline-none transition placeholder:text-ink-4 focus:border-action focus:ring-2 focus:ring-action/20"
              />
              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-wider text-ink-4">
                  ⌘↵ speichern · Esc verwerfen
                </span>
                {hasNote && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft("");
                      onNoteChange(null);
                      setEditing(false);
                    }}
                    className="text-[10px] text-ink-4 transition hover:text-bad"
                  >
                    löschen
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}

// Inline-Formular für „Erinnerung anlegen aus Signal". Erscheint im
// Note-Popover wenn der Pill aus dem Signals-Cluster kommt. Parst
// das Datum aus dem Signal-Namen als Default, schreibt 1-2 Reminder-
// Rows (Vorlauf + Tag selbst).

function SignalReminderSection({
  personId,
  personName,
  signalName,
  onClose,
}: {
  personId: string;
  personName: string;
  signalName: string;
  onClose: () => void;
}) {
  const parsedDate = parseDateFromSignalName(signalName);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(parsedDate);
  const [leadDays, setLeadDays] = useState(7);
  const [alsoOnDay, setAlsoOnDay] = useState(true);
  const [recurrence, setRecurrence] = useState<
    "once" | "weekly" | "monthly" | "yearly"
  >(parsedDate ? "yearly" : "once");
  const [feedback, setFeedback] = useState<string | null>(null);

  function submit() {
    if (!date) {
      setFeedback("Datum fehlt");
      return;
    }
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("person_name", personName);
    fd.set("signal_name", signalName);
    fd.set("remind_at", date);
    fd.set("recurrence", recurrence);
    fd.set("lead_days", String(leadDays));
    if (alsoOnDay) fd.set("also_on_day", "on");
    startTransition(async () => {
      const res = await createSignalReminders(fd);
      if (!res.ok) {
        setFeedback(res.error ?? "Fehler");
      } else {
        setFeedback(
          `${res.created} Erinnerung${res.created === 1 ? "" : "en"} angelegt.`,
        );
        setTimeout(() => onClose(), 1500);
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="t-label mb-1.5 text-ink-4">Erinnerung · {signalName}</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="t-label">Datum</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 w-full rounded border border-rule bg-paper px-2 text-xs outline-none focus:border-action focus:ring-2 focus:ring-action/20"
          />
        </label>
        <label className="space-y-1">
          <span className="t-label">Wiederholung</span>
          <select
            value={recurrence}
            onChange={(e) =>
              setRecurrence(
                e.target.value as "once" | "weekly" | "monthly" | "yearly",
              )
            }
            className="h-8 w-full rounded border border-rule bg-paper px-2 text-xs outline-none focus:border-action focus:ring-2 focus:ring-action/20"
          >
            <option value="once">Einmalig</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
            <option value="yearly">Jährlich</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
        <label className="t-label">Vorlauf</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={365}
            value={leadDays}
            onChange={(e) => setLeadDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="h-8 w-16 rounded border border-rule bg-paper px-2 text-xs outline-none focus:border-action focus:ring-2 focus:ring-action/20"
          />
          <span className="text-[10px] text-ink-3">Tage vorher</span>
        </div>
      </div>
      <label className="flex items-center gap-2 text-[11px] text-ink-2">
        <input
          type="checkbox"
          checked={alsoOnDay}
          onChange={(e) => setAlsoOnDay(e.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--action)]"
        />
        Auch am Tag selbst erinnern
      </label>
      {feedback && (
        <p
          className={`text-[10px] ${
            feedback.includes("Fehler") || feedback.includes("fehlt")
              ? "text-bad"
              : "text-good"
          }`}
        >
          {feedback}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] text-ink-3 transition hover:text-ink-1"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !date}
          className="rounded border border-action bg-action px-3 py-1 text-[10px] font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
        >
          {pending ? "…" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}

// Best-effort Datums-Parser aus einem Signal-Tag-Namen. Spiegel der
// Logik in lib/signals.ts — bewusst dupliziert weil signals.ts ein
// server-only Lib ist (Supabase-Client-Import) und PillWithNote
// client-side rendert. Bei Bedarf späteren Refactor in pure helper.
function parseDateFromSignalName(name: string): string {
  // ISO komplett
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(name);
  if (iso) return iso[0];
  // dd.mm.yyyy
  const dot = /(\d{1,2})[.](\d{1,2})[.](\d{4})/.exec(name);
  if (dot) {
    return `${dot[3]}-${dot[2].padStart(2, "0")}-${dot[1].padStart(2, "0")}`;
  }
  // dd-month-name oder dd month name
  const MONTHS_DE: Record<string, number> = {
    januar: 1, jan: 1, februar: 2, feb: 2, märz: 3, maerz: 3, mar: 3,
    april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7,
    august: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10,
    okt: 10, oct: 10, november: 11, nov: 11, dezember: 12, dez: 12, dec: 12,
  };
  const dayMonth = /(\d{1,2})[\s\-_./](january|jan|februar|feb|märz|maerz|mar|mrz|april|apr|may|mai|june|juni|jun|july|juli|jul|august|aug|september|sept|sep|october|oktober|okt|oct|november|nov|december|dezember|dez|dec)/i.exec(name.toLowerCase());
  if (dayMonth) {
    const day = parseInt(dayMonth[1], 10);
    const mon = MONTHS_DE[dayMonth[2].toLowerCase()];
    if (mon && day >= 1 && day <= 31) {
      const now = new Date();
      let year = now.getFullYear();
      const next = new Date(year, mon - 1, day);
      if (next < new Date(year, now.getMonth(), now.getDate())) year += 1;
      return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return "";
}

function InlineAddInput({
  value,
  onChange,
  onCommit,
  onCancel,
  placeholder,
  bg,
  fg,
  pending,
  widerInput,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  placeholder: string;
  bg: string;
  fg: string;
  pending: boolean;
  widerInput?: boolean;
}) {
  return (
    <input
      type="text"
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        // Kleine Verzögerung damit ein Klick auf eine Suggestion-Row
        // den Blur nicht abbricht. 150ms ist klein genug für UX,
        // groß genug für mousedown→click.
        setTimeout(onCommit, 150);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      disabled={pending}
      placeholder={placeholder}
      className={`rounded-full border border-rule px-2.5 py-1 text-xs outline-none transition placeholder:opacity-60 focus:border-action ${
        widerInput ? "w-full" : "w-44"
      } disabled:opacity-50`}
      style={{ background: bg, color: fg }}
    />
  );
}
