"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { WhatsappInboxRow } from "@/lib/whatsapp-inbox";

// Top-of-inbox strip showing unread WhatsApp messages. Each row
// supports two interactions:
//   • "Gelesen"  — quick dismiss without reply
//   • "Antworten" — expand inline composer; sending writes the
//                   outbound row + auto-marks the inbound as read.
export function WhatsappInboxStrip({ rows }: { rows: WhatsappInboxRow[] }) {
  const [pending, startTransition] = useTransition();
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) return null;

  function markRead(id: string) {
    startTransition(async () => {
      await fetch(`/api/whatsapp/messages/${id}/read`, { method: "POST" });
    });
  }

  function toggleReply(id: string) {
    setError(null);
    setReplyOpen((prev) => (prev === id ? null : id));
  }

  function setDraft(id: string, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: value }));
  }

  async function send(row: WhatsappInboxRow) {
    const text = (drafts[row.id] ?? "").trim();
    if (!text) return;
    setSendingId(row.id);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_number: row.from_number,
          body: text,
          person_id: row.matched_person_id,
          reply_to_id: row.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Send ${res.status}`);
      }
      // Clear local state for this row, then RSC-refresh removes the
      // row entirely (it's now read).
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setReplyOpen(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Senden fehlgeschlagen");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border border-action/30 bg-action-soft/40 p-4">
      <div className="flex items-center justify-between">
        <p className="t-label">WhatsApp · ungelesen</p>
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
          {rows.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((m) => {
          const expanded = replyOpen === m.id;
          const draft = drafts[m.id] ?? "";
          return (
            <li
              key={m.id}
              className="space-y-2 rounded-lg border border-rule bg-paper p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    {m.matched_person_id && m.matched_person_name ? (
                      <Link
                        href={`/people/${m.matched_person_id}`}
                        className="truncate text-sm font-medium text-ink-1 transition hover:text-action"
                      >
                        {m.matched_person_name}
                      </Link>
                    ) : (
                      <span className="truncate font-mono text-xs text-ink-2">
                        {m.from_number}
                      </span>
                    )}
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
                      {new Date(m.message_at).toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-sm text-ink-2">
                    {m.text_body ?? `[${m.message_type}]`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleReply(m.id)}
                    className={`rounded border px-2 py-1 text-[11px] transition ${
                      expanded
                        ? "border-action bg-action text-paper"
                        : "border-rule bg-paper-2 text-ink-2 hover:border-action hover:text-action"
                    }`}
                  >
                    Antworten
                  </button>
                  <button
                    type="button"
                    onClick={() => markRead(m.id)}
                    disabled={pending}
                    className="rounded border border-rule bg-paper-2 px-2 py-1 text-[11px] text-ink-3 transition hover:border-ink-3 hover:text-ink-1 disabled:opacity-50"
                  >
                    Gelesen
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="space-y-2 border-t border-rule-soft pt-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(m.id, e.target.value)}
                    onKeyDown={(e) => {
                      // ⌘+Enter / Ctrl+Enter sends.
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        send(m);
                      }
                    }}
                    rows={2}
                    placeholder="Antwort an WhatsApp…"
                    className="w-full resize-none rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
                    autoFocus
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
                      ⌘↵ zum Senden · an {m.from_number}
                    </span>
                    <button
                      type="button"
                      onClick={() => send(m)}
                      disabled={!draft.trim() || sendingId === m.id}
                      className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
                    >
                      {sendingId === m.id ? "Sende…" : "Senden"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="rounded border border-bad/40 bg-bad/5 px-3 py-2 text-xs text-bad">
          Fehler: {error}
        </p>
      )}
    </div>
  );
}
