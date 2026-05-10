"use client";

import { useEffect, useRef, useState } from "react";

interface DueReminder {
  id: string;
  text: string;
  remind_at: string;
  person_id: string | null;
  type: string;
  recurrence: string;
}

const POLL_INTERVAL_MS = 30_000;
const STORAGE_KEY = "echo:notification-permission-asked";
// Cap on the in-memory "already fired" set so a long-lived tab doesn't
// leak memory. The lookback window in the API is 600s, so anything
// older than ~30 minutes can be safely forgotten.
const FIRED_TTL_MS = 30 * 60 * 1000;

// Fires browser notifications when reminders come due. Polls
// /api/reminders/due every 30s; only works while at least one ECHO tab
// is open. Service-worker-based push will replace this when we go to
// production, but for personal use this is enough.
export function NotificationManager() {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  // Use a Map<id, firedAt> so old entries can be evicted by age.
  const firedRef = useRef<Map<string, number>>(new Map());
  // localStorage check has to happen in an effect, not during render —
  // window is undefined during SSR and the value also affects hooks
  // ordering otherwise.
  const [askedDismissed, setAskedDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
    setAskedDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;

    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      try {
        const res = await fetch("/api/reminders/due?window=60&lookback=600", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const { reminders } = (await res.json()) as { reminders: DueReminder[] };

        const now = Date.now();
        // Evict anything older than the TTL — bounds the set even if
        // the user keeps the tab open for days.
        for (const [id, firedAt] of firedRef.current) {
          if (now - firedAt > FIRED_TTL_MS) firedRef.current.delete(id);
        }

        for (const r of reminders) {
          if (firedRef.current.has(r.id)) continue;
          firedRef.current.set(r.id, now);
          new Notification("ECHO", {
            body: r.text,
            tag: r.id,
            icon: "/favicon.ico",
            badge: "/favicon.ico",
          });
        }
      } catch {
        // network blip — try again next tick
      }
    }

    tick();
    timer = window.setInterval(() => {
      if (!cancelled) tick();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [permission]);

  // Render a soft prompt when permission hasn't been asked yet.
  if (permission === null) return null;
  if (permission === "granted" || permission === "denied") return null;
  if (askedDismissed) return null;

  async function handleAsk() {
    if (typeof Notification === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, "1");
    setAskedDismissed(true);
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  function handleDismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setAskedDismissed(true);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded border border-rule bg-paper p-4 shadow-[0_4px_14px_rgba(20,17,13,0.06)]">
      <p className="mb-3 text-sm text-ink-1">
        Soll ECHO dich bei fälligen Erinnerungen pingen?
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded border border-rule px-3 py-1.5 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
        >
          Später
        </button>
        <button
          type="button"
          onClick={handleAsk}
          className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
        >
          Erlauben
        </button>
      </div>
    </div>
  );
}
