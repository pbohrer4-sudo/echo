"use client";

// Holt sich beim Mount EINEN batched CTA-Vorschlag pro Reminder
// (siehe /api/reminders/ctas) und stellt das Ergebnis per Context
// zur Verfügung. InboxRowItem-Children lesen ihre eigenen CTAs
// per useReminderCtas(id). Wir machen das clientseitig damit der
// Server-Render nicht durch einen LLM-Call blockiert wird.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type CtaMap = Record<string, string[]>;

interface CtaContextValue {
  ctas: CtaMap;
  loading: boolean;
}

const CtaContext = createContext<CtaContextValue>({
  ctas: {},
  loading: false,
});

export function CtaProvider({
  reminderIds,
  children,
}: {
  reminderIds: string[];
  children: ReactNode;
}) {
  const [ctas, setCtas] = useState<CtaMap>({});
  const [loading, setLoading] = useState(reminderIds.length > 0);

  useEffect(() => {
    if (reminderIds.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/reminders/ctas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminder_ids: reminderIds }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ctas?: CtaMap } | null) => {
        if (cancelled) return;
        if (data?.ctas) setCtas(data.ctas);
      })
      .catch(() => {
        // Silent fail — CTAs sind ein Nice-to-Have, kein Blocker.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch wenn sich die Reminder-ID-Liste ändert (z.B. nach
    // einem complete()-Action das die Liste neu rendert).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderIds.join(",")]);

  return (
    <CtaContext.Provider value={{ ctas, loading }}>
      {children}
    </CtaContext.Provider>
  );
}

export function useReminderCtas(reminderId: string): {
  ctas: string[];
  loading: boolean;
} {
  const { ctas, loading } = useContext(CtaContext);
  return { ctas: ctas[reminderId] ?? [], loading };
}
