"use client";

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
  TAG_CLUSTER_COLORS,
  TAG_CLUSTER_LABELS,
  PASSION_COLOR,
  CIRCLE_COLOR,
  type CircleRow,
  type CircleWithNote,
  type PassionRow,
  type TagCluster,
  type TagWithNote,
} from "@/lib/types";
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

interface Props {
  personId: string;
  tags: TagWithNote[];
  passions: PassionRow[];
  personCircles: CircleWithNote[];
  allCircles: CircleRow[];
}

const CLUSTER_ORDER: TagCluster[] = [
  "reminders",
  "interests",
  "potential",
  "origin",
];

export function ClusterEditor({
  personId,
  tags,
  passions,
  personCircles,
  allCircles,
}: Props) {
  return (
    <div className="space-y-8">
      <TagsBlock personId={personId} tags={tags} />
      <PassionsBlock personId={personId} passions={passions} />
      <CirclesBlock
        personId={personId}
        personCircles={personCircles}
        allCircles={allCircles}
      />
    </div>
  );
}

// ───────────── TAGS ─────────────

function TagsBlock({
  personId,
  tags,
}: {
  personId: string;
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
      <div className="space-y-3">
        {CLUSTER_ORDER.map((cluster) => (
          <TagClusterRow
            key={cluster}
            cluster={cluster}
            tags={grouped.get(cluster) ?? []}
            personId={personId}
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
  disabled,
}: {
  cluster: TagCluster;
  tags: TagWithNote[];
  personId: string;
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
      <div className="flex items-center justify-between gap-2">
        <span className="t-label" style={{ color: colors.fg }}>
          {TAG_CLUSTER_LABELS[cluster]}
        </span>
        {!adding && !disabled && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs text-ink-3 transition hover:text-ink-1"
          >
            + Tag
          </button>
        )}
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
        <span className="t-label">Passions ({passions.length}/5)</span>
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
        <span className="t-label">Circles</span>
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
}: {
  label: string;
  note: string | null;
  bg: string;
  fg: string;
  onRemove: () => void;
  onNoteChange: (note: string | null) => void;
  disabled: boolean;
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
      <span>{label}</span>

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

      {/* Inline-Editor — Popover unter dem Pill */}
      {editing && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded border border-rule bg-paper p-2 shadow-[0_4px_14px_rgba(20,17,13,0.08)]"
        >
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
        </div>
      )}
    </span>
  );
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
