-- Rollback for 0049_notifications.sql.

DROP TABLE IF EXISTS "public"."pm_notifications";

ALTER TABLE "public"."pm_workspace_members"
  DROP COLUMN IF EXISTS "email";
