-- 0009 — Wrike-alignment round 2 (research-driven).
--
-- Based on how Wrike actually models things:
--   * Status groups: workflows group statuses into Active / Completed /
--     Deferred / Cancelled; Deferred + Cancelled tasks disappear from to-do
--     and overdue counts. We add the two missing statuses; the group mapping
--     lives in code (lib/pm/types.ts STATUS_GROUP).
--   * Typed dependencies: Wrike supports FS / SS / FF / SF.
--   * Bookmarks: per-space quick links (with optional section).
--   * Personal Space: an auto-created department private to one user
--     (Wrike creates one per user; it cannot be shared).
--
-- Rollback: 0009_wrike_alignment_down.sql (note: enum values cannot be
-- dropped from pm_task_status — they stay, unused, which is harmless).

-- New statuses (usable after this migration's transaction commits).
ALTER TYPE "public"."pm_task_status" ADD VALUE IF NOT EXISTS 'deferred';
ALTER TYPE "public"."pm_task_status" ADD VALUE IF NOT EXISTS 'cancelled';

-- Typed dependencies (default FS = finish-to-start, Wrike's default).
ALTER TABLE "public"."pm_task_dependencies"
  ADD COLUMN "dependency_type" text NOT NULL DEFAULT 'FS'
    CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF'));

-- Personal space: department owned by (and visible to) exactly one user.
ALTER TABLE "public"."pm_departments"
  ADD COLUMN "personal_owner_id" uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX "pm_departments_personal_idx"
  ON "public"."pm_departments" ("personal_owner_id")
  WHERE "personal_owner_id" IS NOT NULL;

-- Bookmarks: quick links on a department (space) or workspace-wide.
CREATE TABLE "public"."pm_bookmarks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "department_id" uuid REFERENCES "public"."pm_departments"(id) ON DELETE CASCADE,
  "section" text,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "position" double precision NOT NULL DEFAULT 0,
  "created_by" uuid NOT NULL REFERENCES auth.users(id),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "pm_bookmarks_department_idx"
  ON "public"."pm_bookmarks" ("department_id");

ALTER TABLE "public"."pm_bookmarks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pm_bookmarks_all" ON "public"."pm_bookmarks"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
