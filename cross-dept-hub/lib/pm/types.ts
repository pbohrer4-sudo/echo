// Shared types for the cross-department project-management module.
// Mirrors the pm_* tables from migration 0047.

export type PmMemberRole = "lead" | "member" | "viewer";

export type PmTaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "archived";

export type PmTaskPriority = "low" | "medium" | "high" | "urgent";
export type PmTaskSource = "internal" | "cross_dept";
export type PmDocKind = "document" | "transcript" | "note" | "decision";
export type PmBriefingStatus = "pending" | "accepted" | "rejected";
export type PmReminderStatus = "pending" | "sent" | "dismissed";
export type PmFilingStatus = "unfiled" | "suggested" | "confirmed" | "failed";
export type PmAiMode = "inherit" | "on" | "off";

export interface PmProject {
  id: string;
  workspace_id: string;
  department_id: string;
  name: string;
  description: string | null;
  color: string;
  status: "active" | "archived";
  ai_mode: PmAiMode;
  position: number;
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PmWorkspace {
  id: string;
  name: string;
  created_by: string;
  ai_enabled: boolean;
  ai_auto_briefing: boolean;
  ai_auto_filing: boolean;
  created_at: string;
  updated_at: string;
}

export interface PmDepartment {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  sprint_capacity_hours: number | null;
  ai_context: string | null;
  sharepoint_site_id: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_root_path: string | null;
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PmTask {
  id: string;
  workspace_id: string;
  owner_department_id: string;
  requester_department_id: string | null;
  project_id: string | null;
  folder_id: string | null;
  parent_task_id: string | null;
  item_type_id: string | null;
  custom_fields: Record<string, string>;
  ai_mode: PmAiMode;
  title: string;
  description: string | null;
  status: PmTaskStatus;
  priority: PmTaskPriority;
  source: PmTaskSource;
  effort_estimate_hours: number | null;
  sprint: string | null;
  start_date: string | null;
  due_date: string | null;
  assignee_id: string | null;
  created_by: string;
  accepted_into_sprint: boolean;
  position: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PmFolder {
  id: string;
  workspace_id: string;
  department_id: string;
  parent_folder_id: string | null;
  name: string;
  description: string | null;
  color: string;
  position: number;
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Field schema of a custom item type (Wrike "Custom Item Types").
export interface PmItemTypeField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options?: string[];
  required?: boolean;
}

export interface PmItemType {
  id: string;
  workspace_id: string;
  name: string;
  icon: string;
  color: string;
  fields: PmItemTypeField[];
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PmTaskLocation {
  task_id: string;
  department_id: string;
  folder_id: string | null;
  created_at: string;
}

export interface PmAutomationActions {
  assign_to?: string | null;
  add_comment?: string | null;
  notify_department?: boolean;
}

export interface PmAutomationRule {
  id: string;
  workspace_id: string;
  department_id: string | null;
  name: string;
  trigger_status: PmTaskStatus;
  actions: PmAutomationActions;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PmBlueprintPayload {
  title?: string;
  description?: string | null;
  priority?: PmTaskPriority;
  effort_estimate_hours?: number | null;
  item_type_id?: string | null;
  ai_mode?: PmAiMode;
  due_days?: number | null;
  subtasks?: string[];
}

export interface PmBlueprint {
  id: string;
  workspace_id: string;
  department_id: string | null;
  name: string;
  description: string | null;
  payload: PmBlueprintPayload;
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PmRequestFormField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  required?: boolean;
  options?: string[];
}

export interface PmRequestForm {
  id: string;
  workspace_id: string;
  target_department_id: string;
  title: string;
  description: string | null;
  fields: PmRequestFormField[];
  blueprint_id: string | null;
  default_priority: PmTaskPriority;
  default_due_days: number | null;
  active: boolean;
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PmTimeEntry {
  id: string;
  workspace_id: string;
  task_id: string;
  user_id: string;
  hours: number;
  entry_date: string;
  note: string | null;
  created_at: string;
}

export type PmApprovalStatus = "pending" | "approved" | "rejected";

export interface PmApproval {
  id: string;
  workspace_id: string;
  task_id: string | null;
  document_id: string | null;
  approver_id: string;
  status: PmApprovalStatus;
  note: string | null;
  decision_comment: string | null;
  decided_at: string | null;
  created_by: string;
  created_at: string;
}

export interface PmTaskBriefing {
  id: string;
  task_id: string;
  workspace_id: string;
  summary: string;
  briefing: string;
  suggested_response: string;
  estimated_hours: number | null;
  open_questions: string[];
  reasoning: string | null;
  model: string;
  status: PmBriefingStatus;
  created_at: string;
  updated_at: string;
}

export interface PmDocument {
  id: string;
  workspace_id: string;
  department_id: string;
  project_id: string | null;
  ai_mode: PmAiMode;
  title: string;
  kind: PmDocKind;
  content: string | null;
  source: string | null;
  filing_status: PmFilingStatus;
  suggested_folder_path: string | null;
  suggested_name: string | null;
  filing_reasoning: string | null;
  confirmed_folder_path: string | null;
  sharepoint_item_id: string | null;
  sharepoint_web_url: string | null;
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PmTaskComment {
  id: string;
  task_id: string;
  workspace_id: string;
  user_id: string | null;
  body: string;
  is_system: boolean;
  created_at: string;
}

export interface PmTaskReminder {
  id: string;
  task_id: string;
  workspace_id: string;
  remind_at: string;
  reason: string;
  status: PmReminderStatus;
  created_at: string;
}

export interface PmTaskDependency {
  task_id: string;
  depends_on_task_id: string;
  created_at: string;
}

// UI helpers ---------------------------------------------------------------

export const TASK_STATUS_LABEL: Record<PmTaskStatus, string> = {
  backlog: "Backlog",
  todo: "Zu erledigen",
  in_progress: "In Arbeit",
  blocked: "Blockiert",
  review: "Review",
  done: "Erledigt",
  archived: "Archiviert",
};

// Columns shown on the department board (archived lives outside the board).
export const BOARD_COLUMNS: PmTaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
];

export const PRIORITY_LABEL: Record<PmTaskPriority, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  urgent: "Dringend",
};

export const DOC_KIND_LABEL: Record<PmDocKind, string> = {
  document: "Dokument",
  transcript: "Transkript",
  note: "Notiz",
  decision: "Entscheidung",
};

export const FILING_STATUS_LABEL: Record<PmFilingStatus, string> = {
  unfiled: "Nicht abgelegt",
  suggested: "Vorschlag wartet",
  confirmed: "Abgelegt",
  failed: "Ablage fehlgeschlagen",
};

export const AI_MODE_LABEL: Record<PmAiMode, string> = {
  inherit: "Erbt",
  on: "An",
  off: "Aus",
};

export const APPROVAL_STATUS_LABEL: Record<PmApprovalStatus, string> = {
  pending: "Ausstehend",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
};

// Views available on the department work area (Wrike-style multi-view).
export type PmView = "board" | "list" | "gantt" | "calendar";
export const VIEW_LABEL: Record<PmView, string> = {
  board: "Board",
  list: "Liste",
  gantt: "Gantt",
  calendar: "Kalender",
};

// Resolve whether AI is effectively enabled for an item, walking the
// override chain item → project → workspace. 'on'/'off' short-circuit;
// 'inherit' defers to the next level up. Pure function (no I/O) so it is
// safe to import anywhere.
export function resolveAiEnabled(
  ownMode: PmAiMode,
  projectMode: PmAiMode | null,
  workspaceEnabled: boolean,
): boolean {
  if (ownMode === "on") return true;
  if (ownMode === "off") return false;
  if (projectMode === "on") return true;
  if (projectMode === "off") return false;
  return workspaceEnabled;
}
