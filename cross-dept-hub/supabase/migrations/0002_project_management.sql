-- 0047 — Cross-Department Project Management Hub.
--
-- Additive, fully isolated from the Personal-CRM tables. Nothing here
-- touches people / interactions / debriefs etc. The module lives behind
-- the `/teams` route group and gives company departments a shared hub:
--
--   * Workspace (the company) with members
--   * Departments (departmental hubs) with members and a knowledge base
--   * Tasks (internal sprint work) + cross-department requests (the "inbox")
--   * Dependencies, comments, smart reminders
--   * AI briefings (suggestion pattern — never auto-applied, always pending
--     until a human accepts; see CLAUDE.md AI Integration Rules)
--
-- RLS model: access is gated at the WORKSPACE level. Any workspace member
-- can read/write that workspace's departments and tasks. Department
-- membership is used for assignment and "my department" UX, not as a hard
-- security boundary. Membership checks go through SECURITY DEFINER helper
-- functions so policies never recurse into the membership table.
--
-- Rollback: see 0047_project_management_down.sql.

SET check_function_bodies = false;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "public"."pm_member_role" AS ENUM ('lead', 'member', 'viewer');
CREATE TYPE "public"."pm_task_status" AS ENUM (
  'backlog', 'todo', 'in_progress', 'blocked', 'review', 'done', 'archived'
);
CREATE TYPE "public"."pm_task_priority" AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE "public"."pm_task_source" AS ENUM ('internal', 'cross_dept');
CREATE TYPE "public"."pm_doc_kind" AS ENUM ('document', 'transcript', 'note', 'decision');
CREATE TYPE "public"."pm_briefing_status" AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE "public"."pm_reminder_status" AS ENUM ('pending', 'sent', 'dismissed');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE "public"."pm_workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "created_by" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "public"."pm_workspace_members" (
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "role" "public"."pm_member_role" NOT NULL DEFAULT 'member',
  "display_name" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("workspace_id", "user_id")
);

CREATE TABLE "public"."pm_departments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "color" text NOT NULL DEFAULT '#6b665d',
  "sprint_capacity_hours" numeric,
  "ai_context" text, -- free-form charter / knowledge the AI agent uses for briefings
  "created_by" uuid NOT NULL REFERENCES auth.users(id),
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("workspace_id", "slug")
);

CREATE TABLE "public"."pm_department_members" (
  "department_id" uuid NOT NULL REFERENCES "public"."pm_departments"(id) ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "role" "public"."pm_member_role" NOT NULL DEFAULT 'member',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("department_id", "user_id")
);

CREATE TABLE "public"."pm_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  -- Department that owns / does the work.
  "owner_department_id" uuid NOT NULL REFERENCES "public"."pm_departments"(id) ON DELETE CASCADE,
  -- For cross-department requests: the department that asked for it.
  "requester_department_id" uuid REFERENCES "public"."pm_departments"(id) ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "status" "public"."pm_task_status" NOT NULL DEFAULT 'backlog',
  "priority" "public"."pm_task_priority" NOT NULL DEFAULT 'medium',
  "source" "public"."pm_task_source" NOT NULL DEFAULT 'internal',
  "effort_estimate_hours" numeric,
  "sprint" text,
  "due_date" date,
  "assignee_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "created_by" uuid NOT NULL REFERENCES auth.users(id),
  "accepted_into_sprint" boolean NOT NULL DEFAULT false,
  "position" double precision NOT NULL DEFAULT 0,
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  -- A cross-department request must name the requesting department, and it
  -- must differ from the owning department.
  CONSTRAINT pm_tasks_cross_dept_requester CHECK (
    source <> 'cross_dept'
    OR (requester_department_id IS NOT NULL
        AND requester_department_id <> owner_department_id)
  )
);

CREATE TABLE "public"."pm_task_dependencies" (
  "task_id" uuid NOT NULL REFERENCES "public"."pm_tasks"(id) ON DELETE CASCADE,
  "depends_on_task_id" uuid NOT NULL REFERENCES "public"."pm_tasks"(id) ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("task_id", "depends_on_task_id"),
  CONSTRAINT pm_task_dependencies_no_self CHECK ("task_id" <> "depends_on_task_id")
);

CREATE TABLE "public"."pm_task_briefings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL REFERENCES "public"."pm_tasks"(id) ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "summary" text NOT NULL,
  "briefing" text NOT NULL,
  "suggested_response" text NOT NULL,
  "estimated_hours" numeric,
  "open_questions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reasoning" text,
  "model" text NOT NULL,
  "status" "public"."pm_briefing_status" NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "public"."pm_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "department_id" uuid NOT NULL REFERENCES "public"."pm_departments"(id) ON DELETE CASCADE,
  "title" text NOT NULL,
  "kind" "public"."pm_doc_kind" NOT NULL DEFAULT 'document',
  "content" text,
  "source" text, -- e.g. "Teams call 2026-06-18", "Notion export"
  "created_by" uuid NOT NULL REFERENCES auth.users(id),
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "public"."pm_task_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL REFERENCES "public"."pm_tasks"(id) ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "body" text NOT NULL,
  "is_system" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "public"."pm_task_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL REFERENCES "public"."pm_tasks"(id) ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "remind_at" timestamptz NOT NULL,
  "reason" text NOT NULL,
  "status" "public"."pm_reminder_status" NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX "pm_workspace_members_user_idx" ON "public"."pm_workspace_members" ("user_id");
CREATE INDEX "pm_departments_workspace_idx" ON "public"."pm_departments" ("workspace_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "pm_department_members_user_idx" ON "public"."pm_department_members" ("user_id");
CREATE INDEX "pm_tasks_owner_status_idx" ON "public"."pm_tasks" ("owner_department_id", "status") WHERE "deleted_at" IS NULL;
CREATE INDEX "pm_tasks_requester_idx" ON "public"."pm_tasks" ("requester_department_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "pm_tasks_workspace_idx" ON "public"."pm_tasks" ("workspace_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "pm_tasks_assignee_idx" ON "public"."pm_tasks" ("assignee_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "pm_task_briefings_task_idx" ON "public"."pm_task_briefings" ("task_id");
CREATE INDEX "pm_documents_department_idx" ON "public"."pm_documents" ("department_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "pm_task_comments_task_idx" ON "public"."pm_task_comments" ("task_id");
CREATE INDEX "pm_task_reminders_due_idx" ON "public"."pm_task_reminders" ("remind_at") WHERE "status" = 'pending';

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuse existing update_updated_at_column())
-- ---------------------------------------------------------------------------

CREATE TRIGGER "pm_workspaces_updated_at" BEFORE UPDATE ON "public"."pm_workspaces"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE TRIGGER "pm_departments_updated_at" BEFORE UPDATE ON "public"."pm_departments"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE TRIGGER "pm_tasks_updated_at" BEFORE UPDATE ON "public"."pm_tasks"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE TRIGGER "pm_task_briefings_updated_at" BEFORE UPDATE ON "public"."pm_task_briefings"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE TRIGGER "pm_documents_updated_at" BEFORE UPDATE ON "public"."pm_documents"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- ---------------------------------------------------------------------------
-- Membership helper (SECURITY DEFINER → no RLS recursion)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."pm_is_workspace_member"("p_workspace_id" uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pm_workspace_members m
    WHERE m.workspace_id = p_workspace_id
      AND m.user_id = auth.uid()
  );
$$;

ALTER FUNCTION "public"."pm_is_workspace_member"(uuid) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."pm_is_workspace_member"(uuid) TO "authenticated";

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."pm_workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_workspace_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_department_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_task_dependencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_task_briefings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_task_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pm_task_reminders" ENABLE ROW LEVEL SECURITY;

-- Workspaces: members can read; the creator can update/delete; anyone
-- authenticated can create a workspace they own.
CREATE POLICY "pm_workspaces_select" ON "public"."pm_workspaces"
  FOR SELECT USING (pm_is_workspace_member(id) OR created_by = auth.uid());
CREATE POLICY "pm_workspaces_insert" ON "public"."pm_workspaces"
  FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "pm_workspaces_update" ON "public"."pm_workspaces"
  FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "pm_workspaces_delete" ON "public"."pm_workspaces"
  FOR DELETE USING (created_by = auth.uid());

-- Workspace members: a member can see the roster; the workspace owner (or
-- an existing member) can add rows. The owner-bootstrap clause lets the
-- creator add themselves right after creating the workspace.
CREATE POLICY "pm_workspace_members_select" ON "public"."pm_workspace_members"
  FOR SELECT USING (pm_is_workspace_member(workspace_id));
CREATE POLICY "pm_workspace_members_insert" ON "public"."pm_workspace_members"
  FOR INSERT WITH CHECK (
    pm_is_workspace_member(workspace_id)
    OR EXISTS (SELECT 1 FROM public.pm_workspaces w
               WHERE w.id = workspace_id AND w.created_by = auth.uid())
  );
CREATE POLICY "pm_workspace_members_update" ON "public"."pm_workspace_members"
  FOR UPDATE USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
CREATE POLICY "pm_workspace_members_delete" ON "public"."pm_workspace_members"
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.pm_workspaces w
            WHERE w.id = workspace_id AND w.created_by = auth.uid())
    OR user_id = auth.uid()
  );

-- Everything else: any workspace member has full access (internal tool).
CREATE POLICY "pm_departments_all" ON "public"."pm_departments"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));

CREATE POLICY "pm_department_members_all" ON "public"."pm_department_members"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.pm_departments d
            WHERE d.id = department_id AND pm_is_workspace_member(d.workspace_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.pm_departments d
            WHERE d.id = department_id AND pm_is_workspace_member(d.workspace_id))
  );

CREATE POLICY "pm_tasks_all" ON "public"."pm_tasks"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));

CREATE POLICY "pm_task_dependencies_all" ON "public"."pm_task_dependencies"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.pm_tasks t
            WHERE t.id = task_id AND pm_is_workspace_member(t.workspace_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.pm_tasks t
            WHERE t.id = task_id AND pm_is_workspace_member(t.workspace_id))
  );

CREATE POLICY "pm_task_briefings_all" ON "public"."pm_task_briefings"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));

CREATE POLICY "pm_documents_all" ON "public"."pm_documents"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));

CREATE POLICY "pm_task_comments_all" ON "public"."pm_task_comments"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));

CREATE POLICY "pm_task_reminders_all" ON "public"."pm_task_reminders"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
