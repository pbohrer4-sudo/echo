-- Rollback for 0050_ai_settings.sql.

ALTER TABLE "public"."pm_workspaces"
  DROP COLUMN IF EXISTS "ai_enabled",
  DROP COLUMN IF EXISTS "ai_auto_briefing",
  DROP COLUMN IF EXISTS "ai_auto_filing";
