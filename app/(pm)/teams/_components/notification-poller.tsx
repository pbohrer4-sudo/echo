"use client";

import { useEffect, useRef, useState } from "react";

interface HubNotification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
}

const POLL_INTERVAL_MS = 30_000;
const STORAGE_KEY = "hub:notification-permission-asked";

// Fires Web Notifications for new hub events while a tab is open. Polls
// /api/pm/notifications/unread and shows anything created since the last
// check. Mirrors the CRM NotificationManager; production push (service
// worker + Web Push) is the documented next step. Email delivery already
// covers users who are away from the app.
export function HubNotificationPoller() {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [askedDismissed, setAskedDismissed] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const sinceRef = useRef<string>(new Date().toISOString());

  // Sync initial state from the browser Notification API + localStorage on
  // mount. These are client-only globals, so reading them in an effect (not
  // during render) is the correct place despite the set-state-in-effect lint.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(Notification.permission);
    setAskedDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(
          `/api/pm/notifications/unread?since=${encodeURIComponent(sinceRef.current)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const { notifications } = (await res.json()) as {
          notifications: HubNotification[];
        };
        for (const n of notifications) {
          if (seenRef.current.has(n.id)) continue;
          seenRef.current.add(n.id);
          const note = new Notification(n.title, {
            body: n.body ?? undefined,
            tag: n.id,
            icon: "/favicon.ico",
            badge: "/favicon.ico",
          });
          if (n.link) {
            note.onclick = () => {
              window.focus();
              window.location.href = n.link!;
            };
          }
        }
        if (notifications.length > 0) {
          sinceRef.current = notifications[0].created_at;
        }
      } catch {
        // network blip — retry next tick
      }
    }

    tick();
    const timer = window.setInterval(() => {
      if (!cancelled) tick();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [permission]);

  if (permission === null || permission === "granted" || permission === "denied")
    return null;
  if (askedDismissed) return null;

  async function handleAsk() {
    if (typeof Notification === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, "1");
    setAskedDismissed(true);
    setPermission(await Notification.requestPermission());
  }

  function handleDismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setAskedDismissed(true);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-lg border border-rule bg-paper p-4 shadow-[0_4px_14px_rgba(20,17,13,0.06)]">
      <p className="mb-3 text-sm text-ink-1">
        Browser-Benachrichtigungen für neue Anfragen und Status-Updates
        aktivieren?
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg border border-rule px-3 py-1.5 text-xs text-ink-3 hover:border-ink-3 hover:text-ink-1"
        >
          Später
        </button>
        <button
          type="button"
          onClick={handleAsk}
          className="rounded-lg border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90"
        >
          Erlauben
        </button>
      </div>
    </div>
  );
}
