import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateWorkspace } from "@/lib/pm/workspace";
import { getDepartmentMap } from "@/lib/pm/departments";
import { loggedHoursByTask } from "@/lib/pm/workload";
import { TASK_STATUS_LABEL, PRIORITY_LABEL } from "@/lib/pm/types";
import type { PmTask } from "@/lib/pm/types";

export const runtime = "nodejs";

// GET /api/pm/reports/tasks[?department=<id>]
// CSV export of the workspace's (or one department's) tasks — the exportable
// report for executives/clients. RLS scopes rows to the caller's workspace.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const ws = await getOrCreateWorkspace();
  const departmentId = new URL(request.url).searchParams.get("department");

  let query = supabase
    .from("pm_tasks")
    .select("*")
    .eq("workspace_id", ws.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (departmentId) query = query.eq("owner_department_id", departmentId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const tasks = (data ?? []) as PmTask[];

  const [deptMap, logged] = await Promise.all([
    getDepartmentMap(ws.id),
    loggedHoursByTask(tasks.map((t) => t.id)),
  ]);

  const esc = (v: unknown): string => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    "Titel",
    "Abteilung",
    "Status",
    "Prioritaet",
    "Start",
    "Faellig",
    "Geschaetzt (h)",
    "Erfasst (h)",
    "Quelle",
    "Erstellt am",
  ].join(";");

  const rows = tasks.map((t) =>
    [
      esc(t.title),
      esc(deptMap[t.owner_department_id]?.name ?? ""),
      esc(TASK_STATUS_LABEL[t.status]),
      esc(PRIORITY_LABEL[t.priority]),
      esc(t.start_date ?? ""),
      esc(t.due_date ?? ""),
      esc(t.effort_estimate_hours ?? ""),
      esc(logged[t.id] ?? 0),
      esc(t.source),
      esc(t.created_at.slice(0, 10)),
    ].join(";"),
  );

  // BOM so Excel opens the umlauts correctly.
  const csv = "﻿" + [header, ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="aufgaben-report.csv"`,
    },
  });
}
