"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WhatsappInboxRow } from "@/lib/whatsapp-inbox";

// Top-of-inbox strip showing unread WhatsApp messages. Each row links
// to the person's profile (if matched) and has a "Gelesen" button.
export function WhatsappInboxStrip({ rows }: { rows: WhatsappInboxRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) return null;

  function markRead(id: string) {
    startTransition(async () => {
      await fetch(`/api/whatsapp/messages/${id}/read`, { method: "POST" });
      router.refresh();
    });
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
        {rows.map((m) => (
          <li
            key={m.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-rule bg-paper px-3 py-2"
          >
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
            <button
              type="button"
              onClick={() => markRead(m.id)}
              disabled={pending}
              className="shrink-0 rounded border border-rule bg-paper-2 px-2 py-1 text-[11px] text-ink-3 transition hover:border-ink-3 hover:text-ink-1 disabled:opacity-50"
            >
              Gelesen
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
