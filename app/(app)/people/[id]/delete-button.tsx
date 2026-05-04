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
        className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:border-red-700 hover:text-red-400"
      >
        Löschen
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-neutral-400">„{name}" wirklich löschen?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await deletePerson(id);
          })
        }
        className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
      >
        {pending ? "Lösche…" : "Ja, löschen"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
      >
        Abbrechen
      </button>
    </div>
  );
}
