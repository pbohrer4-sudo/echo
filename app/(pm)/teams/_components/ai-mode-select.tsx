"use client";

import { useRef } from "react";
import { AI_MODE_LABEL } from "@/lib/pm/types";
import type { PmAiMode } from "@/lib/pm/types";

// Inline three-state AI override (Erbt / An / Aus). Generic over the target:
// the caller passes the server action plus the id field name/value, so the
// same control drives both projects (project_id → updateProjectAiMode) and
// tasks (task_id → updateTaskAiMode).
export function AiModeSelect({
  action,
  idName,
  idValue,
  slug,
  current,
}: {
  action: (formData: FormData) => void | Promise<void>;
  idName: "project_id" | "task_id";
  idValue: string;
  slug: string;
  current: PmAiMode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const modes: PmAiMode[] = ["inherit", "on", "off"];

  return (
    <form ref={formRef} action={action} className="inline-flex items-center gap-1.5">
      <span className="text-[11px] text-ink-4">KI</span>
      <input type="hidden" name={idName} value={idValue} />
      <input type="hidden" name="slug" value={slug} />
      <select
        name="ai_mode"
        defaultValue={current}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded border border-rule bg-paper px-1.5 py-1 text-xs text-ink-2"
        aria-label="KI-Modus"
      >
        {modes.map((m) => (
          <option key={m} value={m}>
            {AI_MODE_LABEL[m]}
          </option>
        ))}
      </select>
    </form>
  );
}
