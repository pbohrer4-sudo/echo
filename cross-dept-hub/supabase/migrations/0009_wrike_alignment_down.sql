-- Rollback for 0009_wrike_alignment.sql.
--
-- Enum values 'deferred' / 'cancelled' cannot be removed from
-- pm_task_status (Postgres does not support dropping enum values); they
-- remain unused after this rollback, which is harmless. Reset any tasks
-- using them first.

UPDATE "public"."pm_tasks" SET "status" = 'archived'
  WHERE "status" IN ('deferred', 'cancelled');

DROP TABLE IF EXISTS "public"."pm_bookmarks";

ALTER TABLE "public"."pm_departments"
  DROP COLUMN IF EXISTS "personal_owner_id";

ALTER TABLE "public"."pm_task_dependencies"
  DROP COLUMN IF EXISTS "dependency_type";
