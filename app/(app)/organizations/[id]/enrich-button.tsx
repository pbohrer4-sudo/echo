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

  return (
    <div className="rounded border border-rule bg-paper-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="t-label">Auto-Enrich</p>
          <p className="text-xs text-ink-3">
            Claude füllt Branche, Website, Größe, HQ, Beschreibung und Tags
            auf Basis seines Trainings aus. Nur leere Felder werden überschrieben.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running || !name.trim()}
          className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
        >
          {running ? "Recherchiere…" : "Auto-Enrich"}
        </button>
      </div>
      {summary && (
        <p className="mt-2 text-xs" style={{ color: "var(--action)" }}>
          {summary}
          {confidence && ` · Confidence: ${confidence}`}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </div>
  );
}
