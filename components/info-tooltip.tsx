"use client";

// Kleines Info-Icon mit Hover-Tooltip — für Section-Header.
//
// Bewusst kein größeres Popover-Component (das macht Hover seltsam) —
// nativer title-Trigger plus eine sichtbare ⓘ-Glyph reicht für die
// V3-Section-Header-Hinweise.

export function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      className="group relative inline-flex cursor-help items-center"
      tabIndex={0}
      aria-label={text}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-ink-4 transition group-hover:text-ink-2 group-focus:text-ink-2"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      {/* Native title als Fallback fürs Mobile, aber wir rendern auch
          ein eigenes Tooltip-Bubble damit Desktop-Hover schöner aussieht. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-1.5 hidden w-64 rounded border border-rule bg-paper px-2.5 py-1.5 text-[11px] leading-snug text-ink-2 shadow-[0_4px_14px_rgba(20,17,13,0.08)] group-hover:block group-focus:block"
      >
        {text}
      </span>
    </span>
  );
}
