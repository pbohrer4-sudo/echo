"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { updateOrganizationTags } from "./actions";

// Inline tag editor for the orgs (and similar) list rows. Click the
// chip area → switches to an editable chip box; commits on blur or
// Enter. Stops propagation so the row's clickable navigation doesn't
// steal the click.
export function InlineTagEditor({
  orgId,
  initialTags,
  existingTags = [],
  hrefPrefix,
}: {
  orgId: string;
  initialTags: string[];
  existingTags?: string[];
  hrefPrefix?: string; // for tag chip Link target, e.g. "/organizations?tag="
}) {
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dirtyRef = useRef(false);

  // Sync down when the parent re-renders with fresh data.
  useEffect(() => {
    if (!editing) setTags(initialTags);
  }, [initialTags, editing]);

  // Click outside → save & exit.
  useEffect(() => {
    if (!editing) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      commitInputAndSave();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, tags, input]);

  // Focus the input when entering edit mode.
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setEditing(true);
  }

  function addTag(value: string) {
    const v = value.trim();
    if (!v) return;
    if (tags.includes(v)) return;
    setTags([...tags, v]);
    dirtyRef.current = true;
  }

  function removeTag(value: string) {
    setTags(tags.filter((t) => t !== value));
    dirtyRef.current = true;
  }

  function commitInputAndSave() {
    const v = input.trim();
    let next = tags;
    if (v && !tags.includes(v)) {
      next = [...tags, v];
      setTags(next);
      dirtyRef.current = true;
    }
    setInput("");
    if (!dirtyRef.current) {
      setEditing(false);
      return;
    }
    start(async () => {
      try {
        await updateOrganizationTags(orgId, next);
        dirtyRef.current = false;
      } finally {
        setEditing(false);
      }
    });
  }

  if (!editing) {
    return (
      <span
        className="flex flex-wrap items-center gap-1 rounded px-1 -mx-1 py-0.5 cursor-text transition hover:bg-paper-3"
        onClick={startEdit}
        role="button"
        tabIndex={-1}
        aria-label="Tags bearbeiten"
        ref={containerRef as unknown as React.Ref<HTMLSpanElement>}
      >
        {tags.length === 0 ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
            + Tag
          </span>
        ) : (
          <>
            {tags.slice(0, 3).map((t) => (
              <Link
                key={t}
                href={`${hrefPrefix ?? "/organizations?tag="}${encodeURIComponent(t)}`}
                onClick={(e) => e.stopPropagation()}
                className="tag transition hover:border-action hover:text-action"
              >
                <span className="dot" />
                {t}
              </Link>
            ))}
            {tags.length > 3 && (
              <span className="font-mono text-[10px] text-ink-4">
                +{tags.length - 3}
              </span>
            )}
          </>
        )}
      </span>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="flex min-h-7 flex-wrap items-center gap-1 rounded border border-action bg-paper px-1.5 py-1 ring-2 ring-action/20"
    >
      {tags.map((t) => (
        <span key={t} className="tag">
          <span className="dot" />
          {t}
          <button
            type="button"
            onClick={() => removeTag(t)}
            className="-mr-0.5 ml-0.5 text-ink-4 transition hover:text-bad"
            aria-label={`Tag ${t} entfernen`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        list="echo-org-tags-inline"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const v = input.trim();
            if (v) {
              addTag(v);
              setInput("");
            } else {
              commitInputAndSave();
            }
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            commitInputAndSave();
            return;
          }
          if (e.key === "Backspace" && input === "" && tags.length > 0) {
            removeTag(tags[tags.length - 1]);
          }
        }}
        disabled={pending}
        placeholder={tags.length === 0 ? "Tag, Enter…" : ""}
        className="min-w-20 flex-1 bg-transparent text-xs text-ink-1 outline-none placeholder:text-ink-4"
      />
      <datalist id="echo-org-tags-inline">
        {existingTags
          .filter((t) => !tags.includes(t))
          .map((t) => (
            <option key={t} value={t} />
          ))}
      </datalist>
    </div>
  );
}
