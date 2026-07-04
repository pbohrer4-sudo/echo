-- Rollback for 0008_work_management.sql.

DROP TABLE IF EXISTS "public"."pm_approvals";
DROP TABLE IF EXISTS "public"."pm_time_entries";
DROP TABLE IF EXISTS "public"."pm_request_forms";
DROP TABLE IF EXISTS "public"."pm_blueprints";
DROP TABLE IF EXISTS "public"."pm_automation_rules";
DROP TABLE IF EXISTS "public"."pm_task_locations";

ALTER TABLE "public"."pm_tasks"
  DROP COLUMN IF EXISTS "folder_id",
  DROP COLUMN IF EXISTS "parent_task_id",
  DROP COLUMN IF EXISTS "item_type_id",
  DROP COLUMN IF EXISTS "custom_fields",
  DROP COLUMN IF EXISTS "start_date";

DROP TABLE IF EXISTS "public"."pm_item_types";
DROP TABLE IF EXISTS "public"."pm_folders";

DROP TYPE IF EXISTS "public"."pm_approval_status";
