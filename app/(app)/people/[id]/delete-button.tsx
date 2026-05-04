"use client";

import { useState, useTransition } from "react";
import { deletePerson } from "../actions";

export function DeleteButton({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-rule px-3 py-1.5 text-xs text-ink-3 transition hover:border-bad hover:text-bad"
      >
        Löschen
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-3">„{name}" wirklich löschen?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await deletePerson(id);
          })
        }
        className="rounded border border-bad bg-bad px-3 py-1.5 text-xs font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Lösche…" : "Ja, löschen"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded border border-rule px-3 py-1.5 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
      >
        Abbrechen
      </button>
    </div>
  );
}
