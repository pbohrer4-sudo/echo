"use client";

// Cluster-Editor (Phase C6, Briefing v3 #19).
//
// Drei Subsections auf der Person-Detail-Page:
//   1. Tags (gruppiert nach 4 Cluster: Reminders, Interests, Potential, Origin)
//   2. Passions (eigene Tabelle, max 5)
//   3. Circles (eigene Tabelle, Communities/Organisationen)
//
// Jede Section: Pills (klick → entfernen) + Add-UI (Input + commit).
// Briefing-Farben aus TAG_CLUSTER_COLORS, PASSION_COLOR, CIRCLE_COLOR.

import { useState, useTransition } from "react";
import {
  TAG_CLUSTER_COLORS,
  TAG_CLUSTER_LABELS,
  PASSION_COLOR,
  CIRCLE_COLOR,
  type CircleRow,
  type PassionRow,
  type TagCluster,
  type TagRow,
} from "@/lib/types";
import {
  addPersonTag,
  removePersonTag,
  addPersonPassion,
  removePersonPassion,
  addPersonCircle,
  removePersonCircle,
} from "@/app/(app)/people/[id]/cluster-actions";

interface Props {
  personId: string;
  tags: TagRow[];
  passions: PassionRow[];
  personCircles: CircleRow[];
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

function TagsBlock({ personId, tags }: { personId: string; tags: TagRow[] }) {
  const grouped = new Map<TagCluster, TagRow[]>();
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
  tags: TagRow[];
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
          <ClusterPill
            key={t.id}
            label={t.name}
            bg={colors.bg}
            fg={colors.fg}
            onRemove={() => commitRemove(t.id)}
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
          <ClusterPill
            key={p.id}
            label={p.name}
            bg={PASSION_COLOR.bg}
            fg={PASSION_COLOR.fg}
            onRemove={() => commitRemove(p.id)}
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
  personCircles: CircleRow[];
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
          <ClusterPill
            key={c.id}
            label={c.name}
            bg={CIRCLE_COLOR.bg}
            fg={CIRCLE_COLOR.fg}
            onRemove={() => commitRemove(c.id)}
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

function ClusterPill({
  label,
  bg,
  fg,
  onRemove,
  disabled,
}: {
  label: string;
  bg: string;
  fg: string;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
      style={{ background: bg, color: fg }}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`${label} entfernen`}
        className="rounded-full leading-none opacity-50 transition hover:opacity-100 disabled:opacity-30"
        style={{ color: fg }}
      >
        ×
      </button>
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
