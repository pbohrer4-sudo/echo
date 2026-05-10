import Link from "next/link";
import type { TabStatus, TabSignal } from "@/lib/tab-status";

// Top-of-tab overview card showing chances (green) + problems (red).
// Rendered above the tab content so the user sees "wo gibt's Druck,
// wo gibt's Chancen" the moment a tab opens.
//
// Tagged with animate-in classes so each tab feels like it slides
// into place — gives the "smooth open" effect when switching tabs.

const SIGNAL_BG_CHANCE = "border-action/30 bg-action-soft/50";
const SIGNAL_BG_PROBLEM = "border-bad/30 bg-bad/5";

export function TabStatusOverview({
  status,
  emptyLabel,
}: {
  status: TabStatus;
  emptyLabel?: string;
}) {
  const { chances, problems } = status;
  const total = chances.length + problems.length;

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-rule bg-paper-2 px-5 py-6 text-center">
        <p className="t-label mb-1">Status</p>
        <p className="text-sm text-ink-3">
          {emptyLabel ?? "Hier ist gerade nichts zu tun — alles im grünen Bereich."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SignalColumn
        title="Chancen"
        accent="text-action"
        signals={chances}
        tone={SIGNAL_BG_CHANCE}
        empty="Keine offenen Chancen — gerade alles abgegrast."
      />
      <SignalColumn
        title="Probleme"
        accent="text-bad"
        signals={problems}
        tone={SIGNAL_BG_PROBLEM}
        empty="Keine Probleme — sauber unterwegs."
      />
    </div>
  );
}

function SignalColumn({
  title,
  accent,
  signals,
  tone,
  empty,
}: {
  title: string;
  accent: string;
  signals: TabSignal[];
  tone: string;
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className={`t-label ${accent}`}>{title}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
          {signals.length}
        </span>
      </div>
      {signals.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rule bg-paper-2 px-3 py-3 text-xs italic text-ink-4">
          {empty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {signals.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <SignalRow signal={s} tone={tone} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SignalRow({ signal, tone }: { signal: TabSignal; tone: string }) {
  const inner = (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${tone}`}>
      <span className="text-base leading-none" aria-hidden>
        {signal.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-1">{signal.label}</p>
        {signal.detail && (
          <p className="mt-0.5 truncate text-xs text-ink-3">{signal.detail}</p>
        )}
      </div>
      {signal.href && (
        <span aria-hidden className="text-xs text-ink-3">
          →
        </span>
      )}
    </div>
  );
  if (signal.href) {
    return (
      <Link
        href={signal.href}
        className="block transition hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(20,17,13,0.04)]"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
