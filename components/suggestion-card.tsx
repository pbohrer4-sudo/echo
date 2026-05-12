"use client";

// SuggestionCard — eine einzelne Vorschlags-Karte mit Accept/Reject/
// Dismiss-Buttons + Optimistic UI (Phase C3).
//
// Jede Karte rendert sich je nach suggestion_type unterschiedlich —
// die renderPayload-Funktion macht das Type-Narrowing. Für unbekannte
// Typen fällt's auf einen generischen JSON-Preview zurück.

import { useState, useTransition } from "react";
import type { SuggestionRow, SuggestionType } from "@/lib/types";
import {
  acceptSuggestionAction,
  rejectSuggestionAction,
  dismissSuggestionAction,
} from "@/app/(app)/people/[id]/suggestion-actions";

const TYPE_LABELS: Record<SuggestionType, string> = {
  tag: "Tag-Vorschlag",
  cadence: "Cadence-Anpassung",
  cta: "Call-to-Action",
  connection: "Beziehung erkannt",
  reconnect: "Reconnect-Trigger",
  depth_change: "Tiefe ändern",
  mode_change: "Modus ändern",
  merge_duplicate: "Mögliches Duplikat",
  purpose_mapping: "Zweck zuordnen",
  how_we_met_extract: "How-We-Met extrahiert",
  field_enrichment: "Feld-Update",
};

// Cluster-Tinten — gegen langweiligen Card-Look. Per Type leicht andere
// Farbe damit man scrollen kann ohne zu lesen.
const TYPE_TINT: Record<SuggestionType, string> = {
  tag: "border-l-action",
  cadence: "border-l-signal",
  cta: "border-l-action",
  connection: "border-l-signal",
  reconnect: "border-l-action",
  depth_change: "border-l-signal",
  mode_change: "border-l-signal",
  merge_duplicate: "border-l-bad/60",
  purpose_mapping: "border-l-action",
  how_we_met_extract: "border-l-signal",
  field_enrichment: "border-l-action",
};

interface Props {
  suggestion: SuggestionRow;
  personId: string;
}

export function SuggestionCard({ suggestion, personId }: Props) {
  const [resolved, setResolved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handle(action: "accept" | "reject" | "dismiss") {
    setResolved(true);
    setError(null);
    startTransition(async () => {
      try {
        const fn =
          action === "accept"
            ? acceptSuggestionAction
            : action === "reject"
              ? rejectSuggestionAction
              : dismissSuggestionAction;
        const result = await fn(suggestion.id, personId);
        if (!result.ok) {
          setResolved(false);
          setError("Konnte nicht gespeichert werden");
        }
      } catch (err) {
        setResolved(false);
        setError(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  if (resolved) return null;

  const typeLabel = TYPE_LABELS[suggestion.suggestion_type] ?? suggestion.suggestion_type;
  const tint = TYPE_TINT[suggestion.suggestion_type] ?? "border-l-rule";

  return (
    <article
      className={`relative overflow-hidden rounded border border-rule border-l-4 bg-paper ${tint} ${
        pending ? "opacity-60" : ""
      }`}
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-rule-soft bg-paper-2 px-4 py-2">
        <span className="t-label">{typeLabel}</span>
        <time
          className="font-mono text-[10px] text-ink-4"
          dateTime={suggestion.created_at}
        >
          {formatRelative(suggestion.created_at)}
        </time>
      </header>

      <div className="space-y-3 px-4 py-3">
        <PayloadView
          type={suggestion.suggestion_type}
          payload={suggestion.payload}
        />
        {suggestion.reasoning && (
          <p className="text-xs italic text-ink-3">
            <span className="t-label mr-1">Grund</span>
            {suggestion.reasoning}
          </p>
        )}
        {error && (
          <p className="text-xs text-bad">{error}</p>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-rule-soft bg-paper-2 px-4 py-2">
        <button
          type="button"
          onClick={() => handle("dismiss")}
          disabled={pending}
          title="Nicht jetzt, später nochmal vorschlagen"
          className="rounded border border-transparent px-2 py-1 text-xs text-ink-3 transition hover:bg-paper hover:text-ink-1 disabled:opacity-50"
        >
          Nicht jetzt
        </button>
        <button
          type="button"
          onClick={() => handle("reject")}
          disabled={pending}
          title="Komplett ablehnen — keine erneuten Vorschläge dieser Art"
          className="rounded border border-rule bg-paper px-3 py-1 text-xs text-ink-2 transition hover:border-bad hover:text-bad disabled:opacity-50"
        >
          Ablehnen
        </button>
        <button
          type="button"
          onClick={() => handle("accept")}
          disabled={pending}
          className="rounded border border-action bg-action px-3 py-1 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
        >
          Übernehmen
        </button>
      </footer>
    </article>
  );
}

// Per-Type Payload-Renderer. Pro suggestion_type ein eigener kleiner
// Block. Unbekannte Typen kriegen einen JSON-Fallback.
function PayloadView({
  type,
  payload,
}: {
  type: SuggestionType;
  payload: Record<string, unknown>;
}) {
  switch (type) {
    case "tag": {
      const tagName = stringField(payload, "tag_name") ?? stringField(payload, "name");
      const currentCluster = stringField(payload, "current_cluster");
      const proposedCluster = stringField(payload, "proposed_cluster");
      if (tagName && proposedCluster) {
        return (
          <p className="text-sm text-ink-1">
            <strong>{tagName}</strong> → Cluster{" "}
            <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-xs">
              {proposedCluster}
            </code>
            {currentCluster && (
              <span className="text-ink-3">
                {" "}(statt {currentCluster})
              </span>
            )}
          </p>
        );
      }
      return <RawJson payload={payload} />;
    }
    case "how_we_met_extract": {
      const extracted = stringField(payload, "how_we_met") ?? stringField(payload, "extracted");
      if (extracted) {
        return (
          <p className="text-sm text-ink-1">„{extracted}"</p>
        );
      }
      return <RawJson payload={payload} />;
    }
    case "purpose_mapping": {
      const proposed = stringField(payload, "proposed_purpose");
      if (proposed) {
        return (
          <p className="text-sm text-ink-1">
            Vorgeschlagener Zweck:{" "}
            <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-xs">
              {proposed}
            </code>
          </p>
        );
      }
      return <RawJson payload={payload} />;
    }
    case "depth_change": {
      const proposed = stringField(payload, "proposed_depth");
      const current = stringField(payload, "current_depth");
      if (proposed) {
        return (
          <p className="text-sm text-ink-1">
            Tiefe →{" "}
            <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-xs">
              {proposed}
            </code>
            {current && (
              <span className="text-ink-3"> (statt {current})</span>
            )}
          </p>
        );
      }
      return <RawJson payload={payload} />;
    }
    case "field_enrichment": {
      const field = stringField(payload, "field");
      const value = stringField(payload, "value") ?? stringField(payload, "new_value");
      if (field && value !== null) {
        return (
          <p className="text-sm text-ink-1">
            <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-xs">
              {field}
            </code>{" "}
            → {value}
          </p>
        );
      }
      return <RawJson payload={payload} />;
    }
    case "merge_duplicate": {
      const otherName =
        stringField(payload, "other_name") ??
        stringField(payload, "duplicate_name");
      if (otherName) {
        return (
          <p className="text-sm text-ink-1">
            Mögliches Duplikat zu <strong>{otherName}</strong>
          </p>
        );
      }
      return <RawJson payload={payload} />;
    }
    case "reconnect": {
      const trigger = stringField(payload, "trigger");
      const message =
        stringField(payload, "draft") ?? stringField(payload, "message");
      return (
        <div className="space-y-1.5 text-sm text-ink-1">
          {trigger && (
            <p className="text-xs text-ink-3">Trigger: {trigger}</p>
          )}
          {message && <p className="italic">„{message}"</p>}
          {!trigger && !message && <RawJson payload={payload} />}
        </div>
      );
    }
    default:
      return <RawJson payload={payload} />;
  }
}

function RawJson({ payload }: { payload: Record<string, unknown> }) {
  return (
    <pre className="overflow-x-auto rounded bg-paper-2 px-3 py-2 font-mono text-[11px] text-ink-2">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

function stringField(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const v = payload[key];
  return typeof v === "string" ? v : null;
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `vor ${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `vor ${diffDay}d`;
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
  });
}
