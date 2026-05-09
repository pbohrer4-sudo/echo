"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";

// Floating toolbar that pins to the top of the viewport whenever a
// person/org form is dirty. Two reasons we do this with a portaled
// `position: fixed` element instead of CSS `position: sticky`:
//
// 1. The app shell's <main> has `overflow-x: hidden`, which the
//    browser auto-promotes to `overflow-y: auto`, making <main> a
//    scroll container even though it never actually scrolls (the
//    body scrolls). Sticky descendants stick within <main> and
//    therefore never engage. Portaling to <body> + fixed sidesteps
//    that entire failure mode.
// 2. Fixed positioning escapes any ancestor with transform/filter
//    that would otherwise capture it. Bulletproof.
//
// Dirty detection runs on three signals to catch every kind of edit:
//   - native input/change events (typed fields, dropdowns)
//   - the form's render cycle (controlled inputs, JSON hidden fields
//     for tags / phones / addresses / etc.)
//   - a 500ms safety poll (catches edge cases like programmatic
//     state changes from auto-enrich or vCard scan)
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
  const [mounted, setMounted] = useState(false);

  // Portal target — only render after mount so SSR and the first
  // client paint agree. document.body is unavailable on the server.
  useEffect(() => {
    setMounted(true);
  }, []);

  function readFormState(form: HTMLFormElement): string {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, val] of fd.entries()) {
      params.append(key, typeof val === "string" ? val : "");
    }
    return params.toString();
  }

  function check() {
    const form = formRef.current;
    if (!form) return;
    const current = readFormState(form);
    if (initialRef.current === null) {
      initialRef.current = current;
      return;
    }
    const next = current !== initialRef.current;
    setDirty((prev) => (prev === next ? prev : next));
  }

  // Capture initial snapshot once + attach native listeners. The
  // listeners catch most edits (typing / selecting) instantly without
  // waiting for a re-render.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    if (initialRef.current === null) {
      initialRef.current = readFormState(form);
    }
    const onChange = () => {
      // Any new edit clears a stale "Speichere…" state — covers the
      // case where a server action errored and the form re-rendered.
      setSubmitting((prev) => (prev ? false : prev));
      check();
    };
    form.addEventListener("input", onChange);
    form.addEventListener("change", onChange);
    return () => {
      form.removeEventListener("input", onChange);
      form.removeEventListener("change", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formRef]);

  // Re-check after every parent render — captures React-only state
  // changes (tag X-button removal, list item add/remove, auto-enrich
  // populating fields) that don't emit native input events.
  useEffect(() => {
    check();
  });

  // Belt-and-suspenders 500ms poll for the rare case both above miss.
  useEffect(() => {
    const id = window.setInterval(check, 500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track submit state so the bar's button echoes the bottom one.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    function onSubmit() {
      setSubmitting(true);
    }
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [formRef]);

  if (!mounted || !dirty) return null;

  function handleSave() {
    formRef.current?.requestSubmit();
  }

  // Sidebar in (app)/layout.tsx is `w-56` = 14rem at every breakpoint,
  // so the bar always sits to its right.
  const bar = (
    <div
      role="region"
      aria-label="Ungespeicherte Änderungen"
      className="fixed left-56 right-0 top-0 z-50 border-b border-rule bg-paper-2/95 shadow-[0_2px_12px_rgba(20,17,13,0.04)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5 sm:px-8">
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

  return createPortal(bar, document.body);
}
