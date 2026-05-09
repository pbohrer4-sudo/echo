"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

// Sticky toolbar that floats at the top of the viewport while the user
// is scrolled deep into a long form. Stays hidden until the form is
// dirty (anything has been changed from its initial state) so the
// chrome stays clean during read-only review.
//
// Dirty detection works by snapshotting the form's FormData on first
// effect, then comparing current FormData against that snapshot on
// every render. Because the parent form's hidden inputs reflect React
// state, every state change triggers a re-render → effect fires →
// snapshot compares fresh.
export function StickySaveBar({
  formRef,
  cancelHref,
  saveLabel = "Speichern",
  cancelLabel = "Abbrechen",
}: {
  formRef: RefObject<HTMLFormElement | null>;
  cancelHref: string;
  saveLabel?: string;
  cancelLabel?: string;
}) {
  const initialRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Run on every render so any state change in the parent (controlled
  // inputs, hidden JSON fields, list mutations) gets picked up. Calling
  // setDirty with the same value is a no-op in React, so no loop.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, val] of fd.entries()) {
      params.append(key, typeof val === "string" ? val : "");
    }
    const current = params.toString();
    if (initialRef.current === null) {
      initialRef.current = current;
      return;
    }
    const next = current !== initialRef.current;
    if (next !== dirty) setDirty(next);
  });

  // Watch for native form submit so the bar's button-disabled state
  // mirrors the bottom button without us having to wire a callback up.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    function onSubmit() {
      setSubmitting(true);
    }
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [formRef]);

  if (!dirty) return null;

  function handleSave() {
    formRef.current?.requestSubmit();
  }

  return (
    <div className="sticky top-0 z-30 -mx-6 mb-4 border-b border-rule bg-paper-2/95 px-6 py-2.5 backdrop-blur sm:-mx-8 sm:px-8">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-ink-3">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-action motion-safe:animate-pulse" />
          Ungespeicherte Änderungen
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={cancelHref}
            className="rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
          >
            {cancelLabel}
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-60"
          >
            {submitting ? "Speichere…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
