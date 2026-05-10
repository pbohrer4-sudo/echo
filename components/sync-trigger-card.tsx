"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SyncResultGeneric {
  ok: boolean;
  pulled?: number;
  ingested?: number;
  matched_to_people?: number;
  interactions_created?: number;
  error?: string;
}

// Reusable "manual sync" card for Calendar + Gmail provider pages.
// Hits the corresponding /api/.../sync endpoint, shows a result line,
// and refreshes RSC so the connection's last_used_at + config update
// flow back into the page below.
export function SyncTriggerCard({
  endpoint,
  label,
  description,
}: {
  endpoint: string;
  label: string;
  description: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResultGeneric | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as SyncResultGeneric;
      setResult({ ...data, ok: res.ok && (data.ok ?? true) });
      if (res.ok) router.refresh();
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Sync fehlgeschlagen",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-rule bg-paper-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="t-label">Manueller Sync</p>
          <p className="mt-1 text-sm text-ink-2">{description}</p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
        >
          {busy ? "Sync läuft…" : `${label} jetzt syncen`}
        </button>
      </div>
      {result && (
        <div
          className={`mt-3 rounded border px-3 py-2 text-xs ${
            result.ok
              ? "border-action/40 bg-paper text-ink-1"
              : "border-bad/40 bg-bad/5 text-bad"
          }`}
        >
          {result.ok ? (
            <span>
              ✓ {result.pulled ?? 0} geholt · {result.ingested ?? 0} aktualisiert ·{" "}
              {result.matched_to_people ?? 0} Personen-Match ·{" "}
              {result.interactions_created ?? 0} neue Interaktionen
            </span>
          ) : (
            <span>Fehler: {result.error ?? "unbekannt"}</span>
          )}
        </div>
      )}
    </section>
  );
}
