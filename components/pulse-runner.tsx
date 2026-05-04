"use client";

import { useState } from "react";

export function PulseRunner() {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sunday-pulse", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Pulse ${res.status}`);
      }
      const { text: pulse } = (await res.json()) as { text: string };
      setText(pulse);
      setGeneratedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-ink-3">
          Aggregiert die letzten 7 Tage und generiert einen Wochenpuls
          via Claude. Kostet ein paar API-Cents.
        </p>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
        >
          {loading
            ? "Erzeuge…"
            : text
              ? "Neu erzeugen"
              : "Sonntags-Puls erzeugen"}
        </button>
      </div>

      {error && (
        <p className="rounded border border-bad/30 bg-bad/5 px-4 py-2 text-sm text-bad">
          Fehler: {error}
        </p>
      )}

      {text && (
        <article className="rounded border border-rule bg-paper p-6">
          {generatedAt && (
            <p className="t-label mb-4">
              Generiert{" "}
              {generatedAt.toLocaleString("de-DE", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
          <p className="whitespace-pre-wrap text-base leading-relaxed text-ink-1">
            {text}
          </p>
        </article>
      )}
    </div>
  );
}
