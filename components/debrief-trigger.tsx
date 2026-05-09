"use client";

import { useState } from "react";
import { DebriefFlow } from "./debrief-flow";
import type { DebriefContext } from "@/lib/debriefs";

// Wraps DebriefFlow so it only mounts (and only auto-starts greeting +
// TTS) after the user explicitly clicks. The page can render this
// trigger subtly without ECHO talking on its own — a frequent
// complaint when the bedside laptop accidentally lands on /debrief.
export function DebriefTrigger({
  displayName,
  context,
}: {
  displayName: string;
  context: DebriefContext;
}) {
  const [started, setStarted] = useState(false);

  if (started) {
    return (
      <div className="rounded-2xl border border-rule bg-paper-2 p-6">
        <DebriefFlow displayName={displayName} context={context} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-rule bg-paper px-6 py-5 text-center">
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <span className="t-label">Heute Abend</span>
        {context.interactionsToday > 0 && (
          <span className="text-ink-4">
            · {context.interactionsToday}{" "}
            {context.interactionsToday === 1 ? "Interaktion" : "Interaktionen"}{" "}
            offen
          </span>
        )}
        {context.dueRemindersToday > 0 && (
          <span className="text-ink-4">
            · {context.dueRemindersToday}{" "}
            {context.dueRemindersToday === 1
              ? "Erinnerung"
              : "Erinnerungen"}{" "}
            fällig
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setStarted(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-rule bg-paper-2 px-4 py-2 text-sm text-ink-2 transition hover:border-action hover:text-action"
      >
        <span aria-hidden>🌙</span>
        Debrief jetzt starten
      </button>
      <p className="text-[10px] uppercase tracking-wider text-ink-4">
        ECHO startet erst nach dem Klick — kein automatisches Geplapper
      </p>
    </div>
  );
}
