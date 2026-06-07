"use client";

// 3-Achsen-Badges (Phase C1, Briefing 4.1-4.3).
//
// Drei klickbare Badges für die zentralen Klassifizierungs-Achsen
// einer Person. Click → Inline-Popover mit den 5 Options + Apply.
//
// Design-Entscheidungen:
// - Inline-Popover (kein Modal) — schneller, weniger Kontext-Wechsel
// - Kein Confirmation-Step — User sieht das Ergebnis sofort dank
//   revalidatePath in der Server Action
// - useTransition für Pending-States, damit der UI nicht freezed
// - Klick-Outside + ESC zum Schließen
// - Empty-State: "Wert wählen" + andere Visual statt fester Wert

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  DEPTH_LABELS,
  MODE_LABELS,
  PURPOSE_LABELS,
  type Depth,
  type Mode,
  type Purpose,
} from "@/lib/types";
import {
  resetDepthToAuto,
  updatePersonDepth,
  updatePersonMode,
  updatePersonPurpose,
} from "@/app/(app)/people/axis-actions";

interface AxisBadgesProps {
  personId: string;
  depth: Depth | null;
  depthSource: "auto" | "manual_override";
  purpose: Purpose | null;
  mode: Mode;
}

export function AxisBadges({
  personId,
  depth,
  depthSource,
  purpose,
  mode,
}: AxisBadgesProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DepthBadge personId={personId} value={depth} source={depthSource} />
      <PurposeBadge personId={personId} value={purpose} />
      <ModeBadge personId={personId} value={mode} />
    </div>
  );
}

// ---------- Generic Inline-Popover Pattern ----------

function usePopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, containerRef };
}

// ---------- Depth ----------

const DEPTH_HINTS: Record<Depth, string> = {
  inner_5: "≥ 24 Interaktionen / Jahr",
  trusted_15: "≥ 12",
  active_50: "≥ 4",
  network_150: "≥ 2",
  periphery_500: "≥ 1",
};

const AXIS_BADGE_BASE =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-action/30";

function DepthBadge({
  personId,
  value,
  source,
}: {
  personId: string;
  value: Depth | null;
  source: "auto" | "manual_override";
}) {
  const { open, setOpen, containerRef } = usePopover();
  const [pending, startTransition] = useTransition();

  function apply(next: Depth) {
    startTransition(async () => {
      await updatePersonDepth(personId, next);
      setOpen(false);
    });
  }

  function reset() {
    startTransition(async () => {
      await resetDepthToAuto(personId);
      setOpen(false);
    });
  }

  const label = value ? DEPTH_LABELS[value] : "Depth?";
  const muted = !value;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={`${AXIS_BADGE_BASE} ${
          muted
            ? "border-dashed border-rule bg-paper text-ink-3 hover:border-ink-3 hover:text-ink-1"
            : "border-action/30 bg-action-soft text-ink-1 hover:border-action"
        } ${pending ? "opacity-50" : ""}`}
        aria-label="Depth wählen"
      >
        <span className="t-label" style={{ letterSpacing: "0.05em" }}>
          Depth
        </span>
        <span>{label}</span>
        {source === "manual_override" && value && (
          <span
            className="font-mono text-[9px] uppercase tracking-wider text-ink-3"
            title="Manuell überschrieben"
          >
            man.
          </span>
        )}
      </button>
      {open && (
        <Popover>
          <PopoverHeader>Depth of relationship</PopoverHeader>
          {(Object.keys(DEPTH_LABELS) as Depth[]).map((d) => (
            <OptionRow
              key={d}
              selected={d === value}
              disabled={pending}
              onClick={() => apply(d)}
              label={DEPTH_LABELS[d]}
              hint={DEPTH_HINTS[d]}
            />
          ))}
          {source === "manual_override" && (
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="block w-full border-t border-rule-soft bg-paper-2 px-3 py-2 text-left text-xs text-ink-3 transition hover:bg-paper hover:text-ink-1 disabled:opacity-50"
            >
              ← Zurück auf automatisch
            </button>
          )}
        </Popover>
      )}
    </div>
  );
}

// ---------- Purpose ----------

const PURPOSE_HINTS: Record<Purpose, string> = {
  personal: "Privater Kontakt",
  family: "Familie / fester Kreis",
  business_active: "Aktive Business-Beziehung",
  business_latent: "Business, aktuell ruhig",
  aspirational: "Möchte ich aktiv aufbauen",
};

function PurposeBadge({
  personId,
  value,
}: {
  personId: string;
  value: Purpose | null;
}) {
  const { open, setOpen, containerRef } = usePopover();
  const [pending, startTransition] = useTransition();

  function apply(next: Purpose) {
    startTransition(async () => {
      await updatePersonPurpose(personId, next);
      setOpen(false);
    });
  }

  const label = value ? PURPOSE_LABELS[value] : "Purpose?";
  const muted = !value;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={`${AXIS_BADGE_BASE} ${
          muted
            ? "border-dashed border-rule bg-paper text-ink-3 hover:border-ink-3 hover:text-ink-1"
            : "border-signal/40 bg-signal-soft text-ink-1 hover:border-signal"
        } ${pending ? "opacity-50" : ""}`}
        aria-label="Purpose wählen"
      >
        <span className="t-label" style={{ letterSpacing: "0.05em" }}>
          Purpose
        </span>
        <span>{label}</span>
      </button>
      {open && (
        <Popover>
          <PopoverHeader>Purpose of relationship</PopoverHeader>
          {(Object.keys(PURPOSE_LABELS) as Purpose[]).map((p) => (
            <OptionRow
              key={p}
              selected={p === value}
              disabled={pending}
              onClick={() => apply(p)}
              label={PURPOSE_LABELS[p]}
              hint={PURPOSE_HINTS[p]}
            />
          ))}
        </Popover>
      )}
    </div>
  );
}

// ---------- Mode ----------

const MODE_HINTS: Record<Mode, string> = {
  active: "Regelmäßiger Kontakt",
  nurture: "Bewusst pflegen",
  cold: "Kalte Beziehung — wenig Wärme, distanziert",
  dormant: "Stiller — länger nicht gemeldet",
  reconnect: "Sollte ich wieder anpacken",
  archive: "Aus dem aktiven Blick",
};

function ModeBadge({
  personId,
  value,
}: {
  personId: string;
  value: Mode;
}) {
  const { open, setOpen, containerRef } = usePopover();
  const [pending, startTransition] = useTransition();

  function apply(next: Mode) {
    startTransition(async () => {
      await updatePersonMode(personId, next);
      setOpen(false);
    });
  }

  // Mode is NOT NULL with default 'active', so always displays a value.
  // Visual unterscheidung: 'archive' wird gedimmt rendered, sonst normal.
  const isArchive = value === "archive";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={`${AXIS_BADGE_BASE} ${
          isArchive
            ? "border-rule bg-paper-2 text-ink-3 hover:border-ink-3"
            : "border-rule bg-paper text-ink-1 hover:border-action hover:text-action"
        } ${pending ? "opacity-50" : ""}`}
        aria-label="Mode wählen"
      >
        <span className="t-label" style={{ letterSpacing: "0.05em" }}>
          Mode
        </span>
        <span>{MODE_LABELS[value]}</span>
      </button>
      {open && (
        <Popover>
          <PopoverHeader>Mode of relationship</PopoverHeader>
          {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
            <OptionRow
              key={m}
              selected={m === value}
              disabled={pending}
              onClick={() => apply(m)}
              label={MODE_LABELS[m]}
              hint={MODE_HINTS[m]}
            />
          ))}
        </Popover>
      )}
    </div>
  );
}

// ---------- Reusable Popover Subcomponents ----------

function Popover({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      className="absolute left-0 top-full z-20 mt-1.5 min-w-[16rem] overflow-hidden rounded border border-rule bg-paper shadow-[0_4px_14px_rgba(20,17,13,0.06)]"
    >
      {children}
    </div>
  );
}

function PopoverHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="t-label border-b border-rule-soft bg-paper-2 px-3 py-1.5">
      {children}
    </div>
  );
}

function OptionRow({
  label,
  hint,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full border-b border-rule-soft px-3 py-2 text-left transition last:border-0 disabled:opacity-50 ${
        selected
          ? "bg-action-soft"
          : "bg-paper hover:bg-paper-2"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-1">{label}</span>
        {selected && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-action">
            ✓
          </span>
        )}
      </span>
      {hint && <span className="block text-[10px] text-ink-4">{hint}</span>}
    </button>
  );
}
