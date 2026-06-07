"use client";

// Reusable person lookup with inline-create. Search the user's existing
// people; pick one, or create a new minimal person from the typed name.
// Extracted from the relationships inline picker so other fields (Origin
// "Vermittelt durch" / "Getroffen mit") can reuse it.
//
// Value is a { id, name } reference (id="" when only a free name is
// known / nothing selected). onChange fires on select, create, or clear.

import { useState } from "react";
import { createMinimalPersonAction } from "@/app/(app)/people/[id]/inline-section-actions";

export interface PersonRef {
  id: string;
  name: string;
}

interface Props {
  value: PersonRef | null;
  candidates: { id: string; name: string }[];
  onChange: (ref: PersonRef | null) => void;
  excludeId?: string;
  placeholder?: string;
}

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

export function PersonLookup({
  value,
  candidates,
  onChange,
  excludeId,
  placeholder = "Name suchen oder neu eintippen",
}: Props) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pool = candidates.filter((p) => p.id !== excludeId);
  const q = query.trim().toLowerCase();
  const filtered = (
    q ? pool.filter((p) => p.name.toLowerCase().includes(q)) : pool
  ).slice(0, 8);
  const exact = pool.find((p) => p.name.toLowerCase() === q);
  const canCreate = query.trim().length >= 2 && !exact;

  async function createAndSelect() {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    const res = await createMinimalPersonAction(fd);
    setCreating(false);
    if (!res.ok || !res.id) {
      setError(res.error ?? "Konnte Person nicht anlegen");
      return;
    }
    onChange({ id: res.id, name });
    setQuery(name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // Typing clears any prior selection until re-picked.
          if (value) onChange(e.target.value ? { id: "", name: e.target.value } : null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={inputClass}
      />
      {open && (filtered.length > 0 || canCreate) && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded border border-rule bg-paper shadow-[0_4px_14px_rgba(20,17,13,0.08)]">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange({ id: p.id, name: p.name });
                setQuery(p.name);
                setOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left text-xs transition hover:bg-paper-2 ${
                value?.id === p.id ? "bg-action-soft text-action" : "text-ink-1"
              }`}
            >
              {p.name}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                void createAndSelect();
              }}
              disabled={creating}
              className="block w-full border-t border-rule-soft px-3 py-1.5 text-left text-xs text-action transition hover:bg-action-soft disabled:opacity-50"
            >
              {creating
                ? "Lege an…"
                : `+ „${query.trim()}" als neue Person anlegen`}
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-bad">{error}</p>}
    </div>
  );
}
