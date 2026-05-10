"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SmartSuggestion } from "@/lib/smart-reminders";

const TYPE_LABEL: Record<SmartSuggestion["reminder_type"], string> = {
  "check-in": "Check-in",
  promise: "Versprechen",
  custom: "Custom",
};

// Loads AI-generated reminder suggestions for drifting/due-soon
// people. Renders inline on /rhythmus. Each suggestion can be
// accepted (creates a real reminder) or dismissed (just removed
// from the local list — next page load will re-suggest if still
// relevant).
export function SmartRemindersPanel() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/reminders/smart");
        if (!res.ok) {
          setError(`Vorschläge ${res.status}`);
          return;
        }
        const data = (await res.json()) as { suggestions: SmartSuggestion[] };
        if (!cancelled) setSuggestions(data.suggestions ?? []);
      } catch {
        if (!cancelled) setError("Vorschläge fehlgeschlagen");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function accept(s: SmartSuggestion) {
    setCommitting(s.person_id);
    setError(null);
    try {
      const res = await fetch("/api/reminders/smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_id: s.person_id,
          reminder_type: s.reminder_type,
          text: s.text,
          remind_at: s.remind_at,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Accept ${res.status}`);
      }
      setSuggestions((prev) => prev.filter((p) => p !== s));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setCommitting(null);
    }
  }

  function dismiss(s: SmartSuggestion) {
    setSuggestions((prev) => prev.filter((p) => p !== s));
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-rule bg-paper-2 p-5">
        <p className="t-label mb-1">Smart Reminders</p>
        <p className="text-xs text-ink-3">ECHO denkt nach…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rule bg-paper-2 p-5">
        <p className="t-label mb-1">Smart Reminders</p>
        <p className="text-xs text-bad">Fehler: {error}</p>
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-action/30 bg-action-soft/40 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="t-label">Smart Reminders</p>
          <p className="text-xs text-ink-3">
            ECHO schlägt vor, was du jetzt anstoßen könntest — based on Cadence
            + letzte Interaktion.
          </p>
        </div>
        <span className="rounded-full border border-action/40 bg-paper px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-action">
          {suggestions.length} {suggestions.length === 1 ? "Vorschlag" : "Vorschläge"}
        </span>
      </div>

      <ul className="space-y-2">
        {suggestions.map((s) => (
          <li
            key={`${s.person_id}-${s.text}`}
            className="rounded-xl border border-rule bg-paper p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink-1">
                    {s.person_name}
                  </span>
                  <span className="rounded border border-rule px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-3">
                    {TYPE_LABEL[s.reminder_type]}
                  </span>
                  {s.daysSince !== null && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
                      {s.daysSince}d her
                    </span>
                  )}
                </p>
                <p className="mt-1 text-sm text-ink-1">{s.text}</p>
                {s.reason && (
                  <p className="mt-0.5 text-xs italic text-ink-3">{s.reason}</p>
                )}
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink-4">
                  Erinnert am{" "}
                  {new Date(s.remind_at).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => dismiss(s)}
                  className="rounded border border-rule bg-paper px-2.5 py-1 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
                >
                  Verwerfen
                </button>
                <button
                  type="button"
                  onClick={() => accept(s)}
                  disabled={committing === s.person_id}
                  className="rounded border border-action bg-action px-2.5 py-1 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
                >
                  {committing === s.person_id ? "…" : "Anlegen"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
