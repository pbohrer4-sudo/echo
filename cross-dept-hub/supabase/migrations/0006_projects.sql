-- 0051 — Projects + per-project / per-task AI toggle.
--
-- Introduces a Project layer between department and task (Wrike-style):
--   workspace → department → project → task
-- Tasks (and documents) may optionally belong to a project.
--
-- The AI on/off switch becomes a three-state override at the project and
-- task (and document) level: 'inherit' | 'on' | 'off'. Effective AI for an
-- item resolves task/doc → project → workspace.ai_enabled. So a single task
-- or a whole project can be kept fully manual regardless of the workspace
-- default.

SET check_function_bodies = false;

CREATE TYPE "public"."pm_ai_mode" AS ENUM ('inherit', 'on', 'off');

CREATE TABLE "public"."pm_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "department_id" uuid NOT NULL REFERENCES "public"."pm_departments"(id) ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "color" text NOT NULL DEFAULT '#6b665d',
  "status" text NOT NULL DEFAULT 'active',
  "ai_mode" "public"."pm_ai_mode" NOT NULL DEFAULT 'inherit',
  "position" double precision NOT NULL DEFAULT 0,
  "created_by" uuid NOT NULL REFERENCES auth.users(id),
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pm_projects_status_check CHECK (status IN ('active', 'archived'))
);

ALTER TABLE "public"."pm_tasks"
  ADD COLUMN "project_id" uuid REFERENCES "public"."pm_projects"(id) ON DELETE SET NULL,
  ADD COLUMN "ai_mode" "public"."pm_ai_mode" NOT NULL DEFAULT 'inherit';

ALTER TABLE "public"."pm_documents"
  ADD COLUMN "project_id" uuid REFERENCES "public"."pm_projects"(id) ON DELETE SET NULL,
  ADD COLUMN "ai_mode" "public"."pm_ai_mode" NOT NULL DEFAULT 'inherit';

CREATE INDEX "pm_projects_department_idx"
  ON "public"."pm_projects" ("department_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "pm_tasks_project_idx"
  ON "public"."pm_tasks" ("project_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "pm_documents_project_idx"
  ON "public"."pm_documents" ("project_id") WHERE "deleted_at" IS NULL;

CREATE TRIGGER "pm_projects_updated_at" BEFORE UPDATE ON "public"."pm_projects"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE "public"."pm_projects" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pm_projects_all" ON "public"."pm_projects"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
