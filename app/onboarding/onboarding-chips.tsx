"use client";

import { useState } from "react";

// Chip input for onboarding steps (interests, passions). Type + Enter to
// add, × to remove. Serializes to a hidden input (JSON array) the step's
// server action reads. Optional `max` caps the count (passions = 5).
export function OnboardingChips({
  name,
  placeholder,
  max,
  color = "action",
}: {
  name: string;
  placeholder: string;
  max?: number;
  color?: "action" | "passion";
}) {
  const [items, setItems] = useState<string[]>([]);
  const [input, setInput] = useState("");

  const atLimit = max != null && items.length >= max;
  const chipClass =
    color === "passion"
      ? "bg-[#FCE7EF] text-[#72243E]"
      : "bg-action-soft text-action";

  function add(raw: string) {
    const v = raw.trim();
    if (!v || atLimit) return;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) return;
    setItems([...items, v]);
    setInput("");
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded border border-rule bg-paper px-2 py-2 focus-within:border-action focus-within:ring-2 focus-within:ring-action/20">
        {items.map((it) => (
          <span
            key={it}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${chipClass}`}
          >
            {it}
            <button
              type="button"
              onClick={() => setItems(items.filter((x) => x !== it))}
              aria-label={`${it} entfernen`}
              className="opacity-50 transition hover:opacity-100"
            >
              ×
            </button>
          </span>
        ))}
        {!atLimit && (
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add(input);
              } else if (
                e.key === "Backspace" &&
                input === "" &&
                items.length > 0
              ) {
                setItems(items.slice(0, -1));
              }
            }}
            onBlur={() => add(input)}
            placeholder={items.length === 0 ? placeholder : ""}
            className="min-w-32 flex-1 bg-transparent text-sm text-ink-1 outline-none placeholder:text-ink-4"
          />
        )}
      </div>
      {max != null && (
        <p className="text-[11px] text-ink-4">
          {items.length}/{max}
        </p>
      )}
    </div>
  );
}
