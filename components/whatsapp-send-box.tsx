"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PhoneEntry } from "@/lib/types";

// Person-profile WhatsApp composer. Lets the user pick a phone number
// (if multiple) and send a message in one shot. Lives next to the
// phone list so the action is where the user expects it.
export function WhatsappSendBox({
  personId,
  phones,
}: {
  personId: string;
  phones: PhoneEntry[];
}) {
  const router = useRouter();
  const eligible = phones.filter((p) => (p.value ?? "").trim().length > 0);
  const [selected, setSelected] = useState<string>(
    eligible[0]?.value ?? "",
  );
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<
    { ok: true } | { ok: false; error: string } | null
  >(null);

  if (eligible.length === 0) return null;

  async function send() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_number: selected,
          body: body.trim(),
          person_id: personId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Send ${res.status}`);
      }
      setResult({ ok: true });
      setBody("");
      router.refresh();
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Senden fehlgeschlagen",
      });
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded border border-rule bg-paper-2 px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action"
      >
        <span aria-hidden>💬</span>
        WhatsApp senden
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-action/30 bg-action-soft/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="t-label">WhatsApp senden</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-ink-3 transition hover:text-ink-1"
          aria-label="Schließen"
        >
          ×
        </button>
      </div>

      {eligible.length > 1 && (
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-8 w-full rounded border border-rule bg-paper px-2 text-sm text-ink-1 outline-none focus:border-action"
        >
          {eligible.map((p, i) => (
            <option key={i} value={p.value ?? ""}>
              {p.label ? `${p.label} · ${p.value}` : p.value}
            </option>
          ))}
        </select>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            if (body.trim()) send();
          }
        }}
        rows={3}
        placeholder="Nachricht…"
        className="w-full resize-none rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
        autoFocus
      />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[10px] uppercase tracking-wider text-ink-4">
          an {selected || "—"} · ⌘↵ senden
        </span>
        <button
          type="button"
          onClick={send}
          disabled={!body.trim() || sending || !selected}
          className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
        >
          {sending ? "Sende…" : "Senden"}
        </button>
      </div>

      {result && result.ok && (
        <p className="text-xs text-action">✓ Gesendet</p>
      )}
      {result && !result.ok && (
        <p className="text-xs text-bad">Fehler: {result.error}</p>
      )}
    </div>
  );
}
