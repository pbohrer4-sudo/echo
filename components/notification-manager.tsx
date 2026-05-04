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

// Fires browser notifications when reminders come due. Polls
// /api/reminders/due every 30s; only works while at least one ECHO tab
// is open. Service-worker-based push will replace this when we go to
// production, but for personal use this is enough.
export function NotificationManager() {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
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

        for (const r of reminders) {
          if (firedRef.current.has(r.id)) continue;
          firedRef.current.add(r.id);
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
  if (typeof window === "undefined") return null;
  if (!("Notification" in window)) return null;
  if (permission === null) return null;
  if (permission === "granted" || permission === "denied") return null;

  const alreadyAsked =
    typeof window !== "undefined" &&
    window.localStorage.getItem(STORAGE_KEY) === "1";
  if (alreadyAsked) return null;

  async function handleAsk() {
    if (typeof Notification === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, "1");
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  function handleDismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setPermission(null);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-md border border-neutral-800 bg-neutral-950 p-4 shadow-lg">
      <p className="mb-3 text-sm text-neutral-200">
        Soll ECHO dich bei fälligen Erinnerungen pingen?
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-600 hover:text-neutral-100"
        >
          Später
        </button>
        <button
          type="button"
          onClick={handleAsk}
          className="rounded-md bg-[#c8ff3e] px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-[#b6eb2c]"
        >
          Erlauben
        </button>
      </div>
    </div>
  );
}
