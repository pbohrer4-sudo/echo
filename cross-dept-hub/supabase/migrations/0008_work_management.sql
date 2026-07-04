-- 0008 — Wrike-parity work management features.
--
-- Adds the structures behind the ten core capabilities:
--   1. Hierarchy      — pm_folders (nestable, per department) + subtasks
--                       (pm_tasks.parent_task_id). Full chain is now
--                       workspace → department (space) → folder/project →
--                       task → subtask.
--   2. Custom types   — pm_item_types with a jsonb field schema; tasks get
--                       item_type_id + custom_fields.
--   3. Views          — list/Gantt/calendar need pm_tasks.start_date.
--   4. Cross-tagging  — pm_task_locations: one task visible in several
--                       departments/folders without duplication.
--   5. Automations    — pm_automation_rules (status-change triggers) and
--                       pm_blueprints (reusable task templates).
--   6. Request forms  — pm_request_forms with a jsonb field list, target
--                       department, optional blueprint and due-day offset.
--   7. Resources      — pm_time_entries (timesheets); workload is computed
--                       from assignee + effort columns that already exist.
--   8. Approvals      — pm_approvals on tasks or documents with a decision
--                       audit trail.
--   9./10. Dashboards + AI risk are computed in code; no schema needed.
--
-- RLS follows the module convention: workspace members have full access,
-- checked via pm_is_workspace_member(). Rollback: 0008_work_management_down.sql.

SET check_function_bodies = false;

CREATE TYPE "public"."pm_approval_status" AS ENUM ('pending', 'approved', 'rejected');

-- 1. Folders -----------------------------------------------------------------

CREATE TABLE "public"."pm_folders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "department_id" uuid NOT NULL REFERENCES "public"."pm_departments"(id) ON DELETE CASCADE,
  "parent_folder_id" uuid REFERENCES "public"."pm_folders"(id) ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "color" text NOT NULL DEFAULT '#6b665d',
  "position" double precision NOT NULL DEFAULT 0,
  "created_by" uuid NOT NULL REFERENCES auth.users(id),
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pm_folders_no_self_parent CHECK (parent_folder_id <> id)
);

-- 2. Custom item types --------------------------------------------------------

-- fields: [{ "key": "browser", "label": "Browser", "type": "text|number|date|select", "options": ["…"] }]
CREATE TABLE "public"."pm_item_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "name" text NOT NULL,
  "icon" text NOT NULL DEFAULT '◆',
  "color" text NOT NULL DEFAULT '#6b665d',
  "fields" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_by" uuid NOT NULL REFERENCES auth.users(id),
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- 1./2./3. Task columns --------------------------------------------------------

ALTER TABLE "public"."pm_tasks"
  ADD COLUMN "folder_id" uuid REFERENCES "public"."pm_folders"(id) ON DELETE SET NULL,
  ADD COLUMN "parent_task_id" uuid REFERENCES "public"."pm_tasks"(id) ON DELETE CASCADE,
  ADD COLUMN "item_type_id" uuid REFERENCES "public"."pm_item_types"(id) ON DELETE SET NULL,
  ADD COLUMN "custom_fields" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "start_date" date;

-- 4. Cross-tagging -------------------------------------------------------------

-- A task's ADDITIONAL locations. Its primary location stays
-- owner_department_id (+ folder_id); rows here make it appear in other
-- departments/folders too — same row, no duplication.
CREATE TABLE "public"."pm_task_locations" (
  "task_id" uuid NOT NULL REFERENCES "public"."pm_tasks"(id) ON DELETE CASCADE,
  "department_id" uuid NOT NULL REFERENCES "public"."pm_departments"(id) ON DELETE CASCADE,
  "folder_id" uuid REFERENCES "public"."pm_folders"(id) ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("task_id", "department_id")
);

-- 5. Automations + blueprints ---------------------------------------------------

-- actions: { "assign_to": "<uuid>|null", "add_comment": "…|null",
--            "notify_department": true|false }
CREATE TABLE "public"."pm_automation_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "department_id" uuid REFERENCES "public"."pm_departments"(id) ON DELETE CASCADE,
  "name" text NOT NULL,
  "trigger_status" "public"."pm_task_status" NOT NULL,
  "actions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "created_by" uuid NOT NULL REFERENCES auth.users(id),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- payload: { "title", "description", "priority", "effort_estimate_hours",
--            "item_type_id", "ai_mode", "due_days", "subtasks": ["…"] }
CREATE TABLE "public"."pm_blueprints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "department_id" uuid REFERENCES "public"."pm_departments"(id) ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid NOT NULL REFERENCES auth.users(id),
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- 6. Request forms ---------------------------------------------------------------

-- fields: [{ "key", "label", "type": "text|textarea|number|date|select",
--            "required": bool, "options": ["…"] }]
CREATE TABLE "public"."pm_request_forms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "target_department_id" uuid NOT NULL REFERENCES "public"."pm_departments"(id) ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "fields" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "blueprint_id" uuid REFERENCES "public"."pm_blueprints"(id) ON DELETE SET NULL,
  "default_priority" "public"."pm_task_priority" NOT NULL DEFAULT 'medium',
  "default_due_days" integer,
  "active" boolean NOT NULL DEFAULT true,
  "created_by" uuid NOT NULL REFERENCES auth.users(id),
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- 7. Timesheets --------------------------------------------------------------------

CREATE TABLE "public"."pm_time_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "task_id" uuid NOT NULL REFERENCES "public"."pm_tasks"(id) ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "hours" numeric NOT NULL CHECK (hours > 0),
  "entry_date" date NOT NULL DEFAULT CURRENT_DATE,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- 8. Approvals ----------------------------------------------------------------------

CREATE TABLE "public"."pm_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "task_id" uuid REFERENCES "public"."pm_tasks"(id) ON DELETE CASCADE,
  "document_id" uuid REFERENCES "public"."pm_documents"(id) ON DELETE CASCADE,
  "approver_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "status" "public"."pm_approval_status" NOT NULL DEFAULT 'pending',
  "note" text,
  "decision_comment" text,
  "decided_at" timestamptz,
  "created_by" uuid NOT NULL REFERENCES auth.users(id),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pm_approvals_target CHECK (task_id IS NOT NULL OR document_id IS NOT NULL)
);

-- Indexes ---------------------------------------------------------------------------

CREATE INDEX "pm_folders_department_idx" ON "public"."pm_folders" ("department_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "pm_tasks_folder_idx" ON "public"."pm_tasks" ("folder_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "pm_tasks_parent_idx" ON "public"."pm_tasks" ("parent_task_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "pm_task_locations_department_idx" ON "public"."pm_task_locations" ("department_id");
CREATE INDEX "pm_automation_rules_ws_idx" ON "public"."pm_automation_rules" ("workspace_id") WHERE "active";
CREATE INDEX "pm_time_entries_task_idx" ON "public"."pm_time_entries" ("task_id");
CREATE INDEX "pm_time_entries_user_idx" ON "public"."pm_time_entries" ("user_id", "entry_date");
CREATE INDEX "pm_approvals_task_idx" ON "public"."pm_approvals" ("task_id");
CREATE INDEX "pm_approvals_approver_idx" ON "public"."pm_approvals" ("approver_id") WHERE "status" = 'pending';

-- updated_at triggers -----------------------------------------------------------------

CREATE TRIGGER "pm_folders_updated_at" BEFORE UPDATE ON "public"."pm_folders"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE TRIGGER "pm_item_types_updated_at" BEFORE UPDATE ON "public"."pm_item_types"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE TRIGGER "pm_automation_rules_updated_at" BEFORE UPDATE ON "public"."pm_automation_rules"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE TRIGGER "pm_blueprints_updated_at" BEFORE UPDATE ON "public"."pm_blueprints"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE TRIGGER "pm_request_forms_updated_at" BEFORE UPDATE ON "public"."pm_request_forms"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- RLS ------------------------------------------------------------------------------------

ALTER TABLE "public"."pm_folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_item_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_task_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_automation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_blueprints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_request_forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_time_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_approvals" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pm_folders_all" ON "public"."pm_folders"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
CREATE POLICY "pm_item_types_all" ON "public"."pm_item_types"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
CREATE POLICY "pm_task_locations_all" ON "public"."pm_task_locations"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.pm_tasks t
            WHERE t.id = task_id AND pm_is_workspace_member(t.workspace_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.pm_tasks t
            WHERE t.id = task_id AND pm_is_workspace_member(t.workspace_id))
  );
CREATE POLICY "pm_automation_rules_all" ON "public"."pm_automation_rules"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
CREATE POLICY "pm_blueprints_all" ON "public"."pm_blueprints"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
CREATE POLICY "pm_request_forms_all" ON "public"."pm_request_forms"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
CREATE POLICY "pm_time_entries_all" ON "public"."pm_time_entries"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
CREATE POLICY "pm_approvals_all" ON "public"."pm_approvals"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
