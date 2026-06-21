-- Rollback for 0051_projects.sql.

ALTER TABLE "public"."pm_documents"
  DROP COLUMN IF EXISTS "project_id",
  DROP COLUMN IF EXISTS "ai_mode";

ALTER TABLE "public"."pm_tasks"
  DROP COLUMN IF EXISTS "project_id",
  DROP COLUMN IF EXISTS "ai_mode";

DROP TABLE IF EXISTS "public"."pm_projects";

DROP TYPE IF EXISTS "public"."pm_ai_mode";
