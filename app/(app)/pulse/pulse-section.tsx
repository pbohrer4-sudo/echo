// Wrapper für eine Pulse-Sektion — Header + Count + Liste-Container.
// Bewusst eigene Komponente damit alle Sektionen visuell konsistent
// sind und das Page-File knapp bleibt.

import type { ReactNode } from "react";

interface Props {
  label: string;
  hint?: string;
  count: number;
  empty?: string;
  children: ReactNode;
}

export function PulseSection({ label, hint, count, empty, children }: Props) {
  return (
    <section className="space-y-3">
      <div className="section-head">
        <span className="t-label">
          {label} ({count})
        </span>
        <span className="rule" />
      </div>
      {hint && (
        <p className="text-[11px] italic text-ink-4">{hint}</p>
      )}
      {count === 0 ? (
        <p className="rounded border border-dashed border-rule bg-paper-2 px-4 py-6 text-center text-xs italic text-ink-4">
          {empty ?? "Nichts hier."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded border border-rule bg-paper">
          {children}
        </ul>
      )}
    </section>
  );
}
