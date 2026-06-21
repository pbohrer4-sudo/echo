-- 0048 — SharePoint-backed knowledge filing.
--
-- The department knowledge base mirrors the company's SharePoint structure.
-- When a document is added, an AI agent inspects its content, compares it
-- against the cached SharePoint folder tree, and proposes:
--   * the right destination folder, and
--   * a clean, context-derived file name.
-- The user confirms (or edits) before the file is filed. Nothing is moved
-- in SharePoint without that human confirmation (CLAUDE.md AI rule #1).

SET check_function_bodies = false;

CREATE TYPE "public"."pm_filing_status" AS ENUM ('unfiled', 'suggested', 'confirmed', 'failed');

-- Per-department SharePoint binding (which site/drive/root the department
-- files into). Populated when the Microsoft Graph connection is set up.
ALTER TABLE "public"."pm_departments"
  ADD COLUMN "sharepoint_site_id" text,
  ADD COLUMN "sharepoint_drive_id" text,
  ADD COLUMN "sharepoint_root_path" text;

-- Filing state on each document.
ALTER TABLE "public"."pm_documents"
  ADD COLUMN "filing_status" "public"."pm_filing_status" NOT NULL DEFAULT 'unfiled',
  ADD COLUMN "suggested_folder_path" text,
  ADD COLUMN "suggested_name" text,
  ADD COLUMN "filing_reasoning" text,
  ADD COLUMN "confirmed_folder_path" text,
  ADD COLUMN "sharepoint_item_id" text,
  ADD COLUMN "sharepoint_web_url" text;

-- Cached SharePoint folder tree the AI picks from. Synced from Microsoft
-- Graph (or seeded for demo). One row per folder.
CREATE TABLE "public"."pm_sharepoint_folders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "department_id" uuid REFERENCES "public"."pm_departments"(id) ON DELETE CASCADE,
  "drive_id" text,
  "item_id" text,
  "name" text NOT NULL,
  "path" text NOT NULL, -- e.g. "/Marketing/Kampagnen/2026"
  "synced_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "pm_sharepoint_folders_dept_idx"
  ON "public"."pm_sharepoint_folders" ("department_id");
CREATE UNIQUE INDEX "pm_sharepoint_folders_dept_path_idx"
  ON "public"."pm_sharepoint_folders" ("department_id", "path");

ALTER TABLE "public"."pm_sharepoint_folders" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pm_sharepoint_folders_all" ON "public"."pm_sharepoint_folders"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
