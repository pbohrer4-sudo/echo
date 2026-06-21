"use client";

import { useRef } from "react";
import { updateTaskStatus } from "../actions";
import { BOARD_COLUMNS, TASK_STATUS_LABEL } from "@/lib/pm/types";
import type { PmTaskStatus } from "@/lib/pm/types";

// Inline status changer used on the board and the task detail page. On
// change it submits the wrapping form, which calls the updateTaskStatus
// server action. No client data fetching — just a progressive-enhancement
// submit.
export function StatusSelect({
  taskId,
  slug,
  current,
  redirectTo,
}: {
  taskId: string;
  slug: string;
  current: PmTaskStatus;
  redirectTo?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={updateTaskStatus}>
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="slug" value={slug} />
      {redirectTo && (
        <input type="hidden" name="redirect_to" value={redirectTo} />
      )}
      <select
        name="status"
        defaultValue={current}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded border border-rule bg-paper px-1.5 py-1 text-xs text-ink-2"
        aria-label="Status ändern"
      >
        {BOARD_COLUMNS.concat("archived").map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </form>
  );
}
