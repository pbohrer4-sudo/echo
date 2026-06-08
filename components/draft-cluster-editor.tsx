"use client";

// Draft-Variante des Cluster-Editors für /people/new.
//
// Im Gegensatz zum vollen ClusterEditor (der pro Aktion eine Server-
// Action triggert + Notes/Tooltips verwaltet) hält dieser hier nur
// lokalen Form-State. Beim Submit serialisiert das Parent-Form alles
// als JSON in ein hidden input — die Server-Action liest das und
// legt nach dem Person-Insert tags/passions/circles an.
//
// Visuell identisch zum ClusterEditor (gleiche Farben, gleiche Info-
// Tooltips, gleicher +Tag-Button-Style) damit Patrick keine kognitive
// Last hat zwischen Create + Detail.

import { useState } from "react";
import {
  CIRCLE_COLOR,
  CIRCLE_HINT,
  PASSION_COLOR,
  PASSION_HINT,
  TAG_CLUSTER_COLORS,
  TAG_CLUSTER_HINTS,
  TAG_CLUSTER_LABELS,
  type CircleRow,
  type TagCluster,
} from "@/lib/types";
import { InfoTooltip } from "@/components/info-tooltip";

export interface DraftClusterState {
  tags: Record<TagCluster, string[]>;
  passions: string[];
  circles: string[]; // Strings — Server resolved via getOrCreateCircle
}

export function emptyDraftClusterState(): DraftClusterState {
  return {
    tags: { reminders: [], interests: [], potential: [], origin: [] },
    passions: [],
    circles: [],
  };
}

// 'origin' → Origin section, 'potential' → Synergien section,
// 'reminders' → Signals (date/reminder section) (2026-06-07).
// Only 'interests' remains a tag cluster.
const CLUSTER_ORDER: TagCluster[] = ["interests"];

interface Props {
  state: DraftClusterState;
  onChange: (next: DraftClusterState) => void;
  existingCircles: CircleRow[];
}

export function DraftClusterEditor({ state, onChange, existingCircles }: Props) {
  function addTag(cluster: TagCluster, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (state.tags[cluster].some((t) => t.toLowerCase() === trimmed.toLowerCase()))
      return;
    onChange({
      ...state,
      tags: {
        ...state.tags,
        [cluster]: [...state.tags[cluster], trimmed],
      },
    });
  }

  function removeTag(cluster: TagCluster, name: string) {
    onChange({
      ...state,
      tags: {
        ...state.tags,
        [cluster]: state.tags[cluster].filter((t) => t !== name),
      },
    });
  }

  function addPassion(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (state.passions.some((p) => p.toLowerCase() === trimmed.toLowerCase()))
      return;
    onChange({ ...state, passions: [...state.passions, trimmed] });
  }
  function removePassion(name: string) {
    onChange({ ...state, passions: state.passions.filter((p) => p !== name) });
  }

  function addCircle(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (state.circles.some((c) => c.toLowerCase() === trimmed.toLowerCase()))
      return;
    onChange({ ...state, circles: [...state.circles, trimmed] });
  }
  function removeCircle(name: string) {
    onChange({ ...state, circles: state.circles.filter((c) => c !== name) });
  }

  return (
    <div className="space-y-4">
      {/* Tags grouped by Cluster */}
      <section className="space-y-3">
        <div className="section-head">
          <span className="t-label">Tags</span>
          <span className="rule" />
        </div>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {CLUSTER_ORDER.map((cluster) => (
            <DraftTagRow
              key={cluster}
              cluster={cluster}
              tags={state.tags[cluster]}
              onAdd={(n) => addTag(cluster, n)}
              onRemove={(n) => removeTag(cluster, n)}
              disabled={false}
            />
          ))}
        </div>
      </section>

      {/* Passions */}
      <section className="space-y-3">
        <div className="section-head">
          <span className="t-label inline-flex items-center gap-1.5">
            Passions{state.passions.length > 0 ? ` (${state.passions.length})` : ""}
            <InfoTooltip text={PASSION_HINT} />
          </span>
          <span className="rule" />
        </div>
        <DraftPillRow
          values={state.passions}
          bg={PASSION_COLOR.bg}
          fg={PASSION_COLOR.fg}
          onAdd={addPassion}
          onRemove={removePassion}
          disabled={false}
          placeholder="+ Passion (z.B. Klassik)"
          emptyLabel="Identitätsstiftende Interessen — wofür die Person brennt"
        />
      </section>

      {/* Circles */}
      <section className="space-y-3">
        <div className="section-head">
          <span className="t-label inline-flex items-center gap-1.5">
            Circles
            <InfoTooltip text={CIRCLE_HINT} />
          </span>
          <span className="rule" />
        </div>
        <DraftCircleRow
          circles={state.circles}
          existingCircles={existingCircles}
          onAdd={addCircle}
          onRemove={removeCircle}
        />
      </section>
    </div>
  );
}

function DraftTagRow({
  cluster,
  tags,
  onAdd,
  onRemove,
  disabled,
}: {
  cluster: TagCluster;
  tags: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  disabled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const colors = TAG_CLUSTER_COLORS[cluster];

  function commit() {
    if (input.trim()) onAdd(input);
    setInput("");
    setAdding(false);
  }

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
          <SimplePill
            key={t}
            label={t}
            bg={colors.bg}
            fg={colors.fg}
            onRemove={() => onRemove(t)}
          />
        ))}
        {adding && (
          <input
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onBlur={() => setTimeout(commit, 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setInput("");
                setAdding(false);
              }
            }}
            placeholder={`+ ${TAG_CLUSTER_LABELS[cluster]}`}
            className="w-44 rounded-full border border-rule px-2.5 py-1 text-xs outline-none transition focus:border-action"
            style={{ background: colors.bg, color: colors.fg }}
          />
        )}
        {!adding && !disabled && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center rounded-full border border-dashed px-2 py-px text-[10px] leading-snug transition hover:border-solid"
            style={{ borderColor: colors.fg, color: colors.fg }}
          >
            + Tag
          </button>
        )}
      </div>
    </div>
  );
}

function DraftPillRow({
  values,
  bg,
  fg,
  onAdd,
  onRemove,
  disabled,
  placeholder,
  emptyLabel,
}: {
  values: string[];
  bg: string;
  fg: string;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  disabled: boolean;
  placeholder: string;
  emptyLabel: string;
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");

  function commit() {
    if (input.trim()) onAdd(input);
    setInput("");
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.length === 0 && !adding && (
        <span className="text-[11px] italic text-ink-4">{emptyLabel}</span>
      )}
      {values.map((v) => (
        <SimplePill
          key={v}
          label={v}
          bg={bg}
          fg={fg}
          onRemove={() => onRemove(v)}
        />
      ))}
      {adding && (
        <input
          type="text"
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => setTimeout(commit, 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setInput("");
              setAdding(false);
            }
          }}
          placeholder={placeholder}
          className="w-48 rounded-full border border-rule px-2.5 py-1 text-xs outline-none transition focus:border-action"
          style={{ background: bg, color: fg }}
        />
      )}
      {!adding && !disabled && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-rule px-2.5 py-1 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
        >
          {placeholder}
        </button>
      )}
    </div>
  );
}

function DraftCircleRow({
  circles,
  existingCircles,
  onAdd,
  onRemove,
}: {
  circles: string[];
  existingCircles: CircleRow[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const usedLower = new Set(circles.map((c) => c.toLowerCase()));
  const inputLower = input.trim().toLowerCase();
  const suggestions = inputLower
    ? existingCircles.filter(
        (c) =>
          c.name.toLowerCase().includes(inputLower) &&
          !usedLower.has(c.name.toLowerCase()),
      )
    : existingCircles.filter((c) => !usedLower.has(c.name.toLowerCase()));

  function commit(value?: string) {
    const v = (value ?? input).trim();
    if (v) onAdd(v);
    setInput("");
    setAdding(false);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {circles.length === 0 && !adding && (
          <span className="text-[11px] italic text-ink-4">
            Communities / Organisationen
          </span>
        )}
        {circles.map((c) => (
          <SimplePill
            key={c}
            label={c}
            bg={CIRCLE_COLOR.bg}
            fg={CIRCLE_COLOR.fg}
            onRemove={() => onRemove(c)}
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
        <div className="space-y-1.5">
          <input
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setInput("");
                setAdding(false);
              }
            }}
            placeholder="Bestehender Circle oder neuer Name…"
            className="w-full rounded-full border border-rule px-2.5 py-1 text-xs outline-none transition focus:border-action"
            style={{ background: CIRCLE_COLOR.bg, color: CIRCLE_COLOR.fg }}
          />
          {suggestions.length > 0 && (
            <ul className="rounded border border-rule bg-paper overflow-hidden">
              {suggestions.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => commit(c.name)}
                    className="block w-full px-3 py-1.5 text-left text-xs text-ink-1 transition hover:bg-paper-2"
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
    </div>
  );
}

function SimplePill({
  label,
  bg,
  fg,
  onRemove,
}: {
  label: string;
  bg: string;
  fg: string;
  onRemove: () => void;
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
        aria-label={`${label} entfernen`}
        className="rounded-full leading-none opacity-50 transition hover:opacity-100"
        style={{ color: fg }}
      >
        ×
      </button>
    </span>
  );
}
