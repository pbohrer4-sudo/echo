"use client";

import { openSearch } from "./search-modal";

// Sidebar entry that fires the global Cmd+K modal. Lives outside
// the modal component so it can be rendered in the sticky sidebar
// without forcing the heavy modal markup to mount until needed.
export function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={openSearch}
      className="flex w-full items-center justify-between gap-2 rounded border border-rule bg-paper-2 px-3 py-1.5 text-left text-sm text-ink-3 transition hover:border-action hover:text-action"
    >
      <span className="flex items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-3.5-3.5" />
        </svg>
        Suchen
      </span>
      <kbd className="rounded border border-rule bg-paper px-1 font-mono text-[9px] text-ink-4">
        ⌘K
      </kbd>
    </button>
  );
}
