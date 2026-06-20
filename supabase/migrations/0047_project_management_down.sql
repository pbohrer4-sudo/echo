-- Rollback for 0047_project_management.sql.
--
-- Run manually (Supabase migrations are forward-only). Drops every PM
-- object in dependency order. Destroys all project-management data — take
-- a backup of the pm_* tables first if anything is worth keeping.

DROP FUNCTION IF EXISTS "public"."pm_is_workspace_member"(uuid);

DROP TABLE IF EXISTS "public"."pm_task_reminders";
DROP TABLE IF EXISTS "public"."pm_task_comments";
DROP TABLE IF EXISTS "public"."pm_documents";
DROP TABLE IF EXISTS "public"."pm_task_briefings";
DROP TABLE IF EXISTS "public"."pm_task_dependencies";
DROP TABLE IF EXISTS "public"."pm_tasks";
DROP TABLE IF EXISTS "public"."pm_department_members";
DROP TABLE IF EXISTS "public"."pm_departments";
DROP TABLE IF EXISTS "public"."pm_workspace_members";
DROP TABLE IF EXISTS "public"."pm_workspaces";

DROP TYPE IF EXISTS "public"."pm_reminder_status";
DROP TYPE IF EXISTS "public"."pm_briefing_status";
DROP TYPE IF EXISTS "public"."pm_doc_kind";
DROP TYPE IF EXISTS "public"."pm_task_source";
DROP TYPE IF EXISTS "public"."pm_task_priority";
DROP TYPE IF EXISTS "public"."pm_task_status";
DROP TYPE IF EXISTS "public"."pm_member_role";
