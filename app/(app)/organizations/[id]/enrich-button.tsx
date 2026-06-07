"use client";

// Auto-Enrich-Button für die Organisation-Detail-Page. Klick →
// POST /api/enrich-organization → applyEnrichmentAction merged das
// Resultat ins DB-Row (nur leere Felder werden überschrieben).
// Dieselbe Logik wie im Edit-Form, aber als standalone Block damit
// man's nicht erst per „Bearbeiten" öffnen muss.

import { useState, useTransition } from "react";
import {
  applyEnrichmentAction,
  type EnrichmentData,
} from "./enrich-actions";

interface Props {
  orgId: string;
  name: string;
  domain: string | null;
}

export function OrgEnrichButton({ orgId, name, domain }: Props) {
  const [running, setRunning] = useState(false);
  const [_pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<
    "high" | "medium" | "low" | null
  >(null);

  async function run() {
    if (running) return;
    setRunning(true);
    setError(null);
    setSummary(null);
    setConfidence(null);
    try {
      const res = await fetch("/api/enrich-organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain: domain ?? undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Enrich ${res.status}`);
      }
      const { data } = (await res.json()) as {
        data: EnrichmentData & { uncertain: boolean };
      };
      if (data.uncertain) {
        setError(
          "Konnte die Organisation nicht eindeutig identifizieren — manuell prüfen.",
        );
        return;
      }
      startTransition(async () => {
        const applied = await applyEnrichmentAction(orgId, {
          industry: data.industry,
          website: data.website,
          domain: data.domain,
          size: data.size,
          hq: data.hq,
          description: data.description,
          tags: data.tags ?? [],
          confidence: data.confidence,
        });
        if (!applied.ok) {
          setError(applied.error ?? "Fehler beim Speichern");
          return;
        }
        setConfidence(data.confidence ?? null);
        setSummary(
          applied.filled.length > 0
            ? `Vorausgefüllt: ${applied.filled.join(", ")}`
            : "Alle relevanten Felder waren schon gesetzt — Stand aktualisiert.",
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrich fehlgeschlagen");
    } finally {
      setRunning(false);
    }
  }

  // Compact button that lives in the detail-page header action row, left
  // of "Bearbeiten". Feedback (summary / error) renders in an absolutely-
  // positioned line below the button so it never disturbs the header
  // flex layout. On success applyEnrichmentAction revalidates the page,
  // so the "Auto-Enrich {date}" badge also refreshes.
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={run}
        disabled={running || !name.trim()}
        title="Branche, Website, Größe, HQ, Beschreibung und Tags automatisch ergänzen (nur leere Felder)."
        className="whitespace-nowrap rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action disabled:opacity-50"
      >
        {running ? "Recherchiere…" : "Auto-Enrich"}
      </button>
      {(summary || error) && (
        <p
          className={`absolute left-0 top-full z-10 mt-1 max-w-xs whitespace-normal rounded border bg-paper px-2 py-1 text-[11px] shadow-sm ${
            error
              ? "border-bad/40 text-bad"
              : "border-rule text-ink-3"
          }`}
          style={!error ? { color: "var(--action)" } : undefined}
        >
          {error ?? summary}
          {!error && confidence && ` · ${confidence}`}
        </p>
      )}
    </div>
  );
}
