"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { VCardContact } from "@/lib/vcard";

interface MatchInfo {
  person_id: string;
  person_name: string;
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

interface PreviewRow extends VCardContact {
  key: string;
  match: MatchInfo | null;
}

type Action = "create" | "merge" | "skip";

interface PreviewSummary {
  parsed: number;
  matches: number;
  high_confidence: number;
  file_name: string;
  file_size: number;
}

const REASON_LABEL: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  email: "Email",
};

export function ImportRunner() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [actions, setActions] = useState<Map<string, Action>>(new Map());

  function defaultAction(row: PreviewRow): Action {
    if (!row.match) return "create";
    // High-Confidence-Match: vorschlagen zu mergen.
    // Medium: skip damit kein versehentlicher Merge passiert.
    if (row.match.confidence === "high") return "merge";
    return "skip";
  }

  async function handleFile(file: File) {
    setParsing(true);
    setError(null);
    setRows([]);
    setSummary(null);
    setActions(new Map());
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/vcard", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Parse ${res.status}`);
      }
      const data = (await res.json()) as {
        rows: PreviewRow[];
        summary: PreviewSummary;
      };
      setRows(data.rows);
      setSummary(data.summary);
      const init = new Map<string, Action>();
      for (const r of data.rows) init.set(r.key, defaultAction(r));
      setActions(init);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse fehlgeschlagen");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function commit() {
    setCommitting(true);
    setError(null);
    try {
      const payload = rows
        .map((r) => ({
          ...r,
          action: actions.get(r.key) ?? "create",
          merge_into_id: r.match?.person_id,
        }))
        .filter((r) => r.action !== "skip");

      if (payload.length === 0) {
        setError("Keine Zeilen zum Importieren oder Mergen ausgewählt.");
        return;
      }
      const res = await fetch("/api/import/vcard/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Import ${res.status}`);
      }
      const result = (await res.json()) as {
        inserted: number;
        merged: number;
        skipped: number;
        errors: string[];
      };
      router.push(
        `/people?imported=${result.inserted}&merged=${result.merged}${
          result.errors.length > 0 ? `&errors=${result.errors.length}` : ""
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import fehlgeschlagen");
    } finally {
      setCommitting(false);
    }
  }

  function setAction(key: string, action: Action) {
    setActions((prev) => {
      const next = new Map(prev);
      next.set(key, action);
      return next;
    });
  }

  function bulkSetByDefault() {
    const next = new Map<string, Action>();
    for (const r of rows) next.set(r.key, defaultAction(r));
    setActions(next);
  }
  function bulkSetAllCreate() {
    const next = new Map<string, Action>();
    for (const r of rows) next.set(r.key, "create");
    setActions(next);
  }
  function bulkSetAllSkip() {
    const next = new Map<string, Action>();
    for (const r of rows) next.set(r.key, "skip");
    setActions(next);
  }

  const counts = {
    create: 0,
    merge: 0,
    skip: 0,
  };
  for (const r of rows) {
    counts[actions.get(r.key) ?? "create"] += 1;
  }

  return (
    <div className="space-y-6">
      {!summary && (
        <div className="rounded border border-rule bg-paper p-6">
          <p className="t-label mb-2">Schritt 1 — vCard wählen</p>
          <p className="mb-4 text-sm text-ink-3">
            Auf dem iPhone: Kontakte → ⋯ → Listen → „Alle iCloud" auswählen
            → ⋯ → Exportieren. Auf dem Mac: Kontakte → cmd-A → Datei →
            Exportieren → vCard. Die .vcf-Datei hier hochladen.
          </p>
          <p className="mb-4 text-xs text-ink-4">
            Smart-Dedup: Echo gleicht Name, Telefon und Email gegen alle
            bestehenden Personen ab. Bei sicheren Treffern wird vorgeschlagen
            zu mergen statt doppelt anzulegen.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".vcf,text/vcard,text/x-vcard"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
          >
            {parsing ? "Lese ein…" : "Datei wählen"}
          </button>
          {error && <p className="mt-3 text-sm text-bad">Fehler: {error}</p>}
        </div>
      )}

      {summary && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-rule bg-paper-2 px-4 py-3">
            <div className="text-sm">
              <p className="font-medium text-ink-1">
                {summary.parsed} Kontakte gelesen
              </p>
              <p className="text-xs text-ink-3">
                {summary.matches} Match
                {summary.matches !== 1 ? "es" : ""} (
                {summary.high_confidence} mit hoher Sicherheit) ·{" "}
                {summary.file_name}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={bulkSetByDefault}
                className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action"
                title="Pro Row: Match-High → Mergen, Match-Medium → Skip, kein Match → Anlegen"
              >
                Smart-Default
              </button>
              <button
                type="button"
                onClick={bulkSetAllCreate}
                className="rounded border border-rule px-3 py-1.5 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
              >
                Alle anlegen
              </button>
              <button
                type="button"
                onClick={bulkSetAllSkip}
                className="rounded border border-rule px-3 py-1.5 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
              >
                Alle skippen
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded border border-rule bg-paper">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_180px_140px] gap-3 border-b border-rule bg-paper-2 px-4 py-2.5">
              <span className="t-label">Name</span>
              <span className="t-label">Firma · Rolle</span>
              <span className="t-label">Felder</span>
              <span className="t-label">Match</span>
              <span className="t-label">Aktion</span>
            </div>
            {rows.map((r) => {
              const action = actions.get(r.key) ?? "create";
              const fieldsBits = [
                r.phones.length && `${r.phones.length} Tel`,
                r.emails.length && `${r.emails.length} Email`,
                r.addresses.length && `${r.addresses.length} Adr`,
                r.socials.length && `${r.socials.length} Social`,
                r.birthday && "BDAY",
                r.notes && "Notiz",
              ].filter(Boolean) as string[];
              return (
                <div
                  key={r.key}
                  className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_180px_140px] items-center gap-3 border-b border-rule-soft px-4 py-3 transition last:border-0 ${
                    action === "skip" ? "opacity-50" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-1">
                      {r.name}
                    </span>
                  </span>
                  <span className="truncate text-xs text-ink-3">
                    {[r.company, r.role].filter(Boolean).join(" · ") || "—"}
                  </span>
                  <span className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
                    {fieldsBits.join(" · ") || "nur Name"}
                  </span>
                  <span className="min-w-0">
                    {r.match ? (
                      <span className="flex flex-col">
                        <span className="truncate text-xs text-ink-2">
                          {r.match.person_name}
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-4">
                          {r.match.confidence} · {r.match.reasons
                            .map((x) => REASON_LABEL[x] ?? x)
                            .join("+")}
                        </span>
                      </span>
                    ) : (
                      <span className="font-mono text-[9px] uppercase tracking-wider text-ink-4">
                        keine Übereinstimmung
                      </span>
                    )}
                  </span>
                  <select
                    value={action}
                    onChange={(e) => setAction(r.key, e.target.value as Action)}
                    className="h-9 rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20"
                  >
                    <option value="create">Anlegen</option>
                    <option value="merge" disabled={!r.match}>
                      {r.match ? "Mergen" : "(kein Match)"}
                    </option>
                    <option value="skip">Skippen</option>
                  </select>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Link
              href="/people"
              className="rounded border border-rule px-3 py-1.5 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
            >
              Abbrechen
            </Link>
            <div className="flex items-center gap-2">
              {error && <span className="text-xs text-bad">{error}</span>}
              <span className="text-xs text-ink-3">
                {counts.create} anlegen · {counts.merge} mergen ·{" "}
                {counts.skip} skippen
              </span>
              <button
                type="button"
                onClick={commit}
                disabled={
                  committing || counts.create + counts.merge === 0
                }
                className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
              >
                {committing
                  ? "Importiere…"
                  : `Übernehmen (${counts.create + counts.merge})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
