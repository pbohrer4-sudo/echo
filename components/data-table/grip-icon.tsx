// Mini Grip-Icon — 6 Punkte in 2x3 Grid. Wird in Sortable-Headers und
// Popover-Rows als Drag-Handle benutzt.

export function GripIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 10 14"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="2.5" cy="3" r="1" />
      <circle cx="7.5" cy="3" r="1" />
      <circle cx="2.5" cy="7" r="1" />
      <circle cx="7.5" cy="7" r="1" />
      <circle cx="2.5" cy="11" r="1" />
      <circle cx="7.5" cy="11" r="1" />
    </svg>
  );
}
