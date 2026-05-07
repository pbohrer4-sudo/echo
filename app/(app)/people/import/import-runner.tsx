"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { VCardContact } from "@/lib/vcard";

interface PreviewRow extends VCardContact {
  key: string;
  duplicate: boolean;
  duplicate_of_id: string | null;
}

interface PreviewSummary {
  parsed: number;
  duplicates: number;
  file_name: string;
  file_size: number;
}

export function ImportRunner() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function handleFile(file: File) {
    setParsing(true);
    setError(null);
    setRows([]);
    setSummary(null);
    setSelected(new Set());
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
      // Auto-select non-duplicates by default — fewest clicks for the
      // common case of "import everything new from my iPhone".
      setSelected(
        new Set(data.rows.filter((r) => !r.duplicate).map((r) => r.key)),
      );
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
      const toInsert = rows.filter((r) => selected.has(r.key));
      if (toInsert.length === 0) {
        setError("Keine Zeilen ausgewählt.");
        return;
      }
      const res = await fetch("/api/import/vcard/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: toInsert }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Import ${res.status}`);
      }
      const result = (await res.json()) as {
        inserted: number;
        errors: string[];
      };
      router.push(
        `/people?imported=${result.inserted}${
          result.errors.length > 0 ? `&errors=${result.errors.length}` : ""
        }`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import fehlgeschlagen");
    } finally {
      setCommitting(false);
    }
  }

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  function selectAll() {
    setSelected(new Set(rows.map((r) => r.key)));
  }
  function selectNone() {
    setSelected(new Set());
  }
  function selectNew() {
    setSelected(new Set(rows.filter((r) => !r.duplicate).map((r) => r.key)));
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
          {error && (
            <p className="mt-3 text-sm text-bad">Fehler: {error}</p>
          )}
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
                {summary.duplicates} davon bereits im CRM ·{" "}
                {summary.file_name}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={selectNew}
                className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action"
              >
                Nur neue ({summary.parsed - summary.duplicates})
              </button>
              <button
                type="button"
                onClick={selectAll}
                className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
              >
                Alle
              </button>
              <button
                type="button"
                onClick={selectNone}
                className="rounded border border-rule px-3 py-1.5 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
              >
                Keine
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded border border-rule bg-paper">
            <div className="grid grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-3 border-b border-rule bg-paper-2 px-4 py-2.5">
              <span className="t-label" />
              <span className="t-label">Name</span>
              <span className="t-label">Firma · Rolle</span>
              <span className="t-label">Felder</span>
              <span className="t-label text-right">Status</span>
            </div>
            {rows.map((r) => {
              const checked = selected.has(r.key);
              const fieldsBits = [
                r.phones.length && `${r.phones.length} Tel`,
                r.emails.length && `${r.emails.length} Email`,
                r.addresses.length && `${r.addresses.length} Adr`,
                r.socials.length && `${r.socials.length} Social`,
                r.birthday && "BDAY",
                r.notes && "Notiz",
              ].filter(Boolean) as string[];
              return (
                <label
                  key={r.key}
                  className={`grid cursor-pointer grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-3 border-b border-rule-soft px-4 py-3 transition last:border-0 hover:bg-paper-2 ${
                    checked ? "" : "opacity-60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(r.key)}
                    className="h-4 w-4 accent-[var(--action)]"
                  />
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
                  <span className="text-right">
                    {r.duplicate ? (
                      <span
                        className="rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                        style={{
                          borderColor: "var(--rule)",
                          color: "var(--ink-3)",
                          background: "var(--paper-2)",
                        }}
                      >
                        Bereits da
                      </span>
                    ) : (
                      <span
                        className="rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                        style={{
                          borderColor: "oklch(58% 0.10 145)",
                          color: "oklch(34% 0.06 145)",
                          background: "oklch(94% 0.04 145)",
                        }}
                      >
                        Neu
                      </span>
                    )}
                  </span>
                </label>
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
              {error && (
                <span className="text-xs text-bad">Fehler: {error}</span>
              )}
              <button
                type="button"
                onClick={commit}
                disabled={committing || selected.size === 0}
                className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
              >
                {committing
                  ? "Importiere…"
                  : `${selected.size} importieren`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
