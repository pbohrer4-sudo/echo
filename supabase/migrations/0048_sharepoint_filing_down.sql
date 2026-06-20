-- Rollback for 0048_sharepoint_filing.sql.

DROP TABLE IF EXISTS "public"."pm_sharepoint_folders";

ALTER TABLE "public"."pm_documents"
  DROP COLUMN IF EXISTS "filing_status",
  DROP COLUMN IF EXISTS "suggested_folder_path",
  DROP COLUMN IF EXISTS "suggested_name",
  DROP COLUMN IF EXISTS "filing_reasoning",
  DROP COLUMN IF EXISTS "confirmed_folder_path",
  DROP COLUMN IF EXISTS "sharepoint_item_id",
  DROP COLUMN IF EXISTS "sharepoint_web_url";

ALTER TABLE "public"."pm_departments"
  DROP COLUMN IF EXISTS "sharepoint_site_id",
  DROP COLUMN IF EXISTS "sharepoint_drive_id",
  DROP COLUMN IF EXISTS "sharepoint_root_path";

DROP TYPE IF EXISTS "public"."pm_filing_status";
