-- 0049 — Notifications for the department hub.
--
-- Every notable event (new inbox request, AI briefing ready, request
-- accepted, status change, new comment) produces a notification row per
-- recipient. Delivery fans out to three channels:
--   * in-app  — this table, shown in the notification centre / bell badge
--   * browser — a foreground poller fires the Web Notifications API
--   * email   — best-effort via Resend or Microsoft Graph (see lib/pm/email)
--
-- The recipient's email is denormalised onto pm_workspace_members so the
-- dispatcher can address mail without reaching into auth.users.

SET check_function_bodies = false;

ALTER TABLE "public"."pm_workspace_members"
  ADD COLUMN IF NOT EXISTS "email" text;

CREATE TABLE "public"."pm_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "recipient_user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "link" text,
  "task_id" uuid REFERENCES "public"."pm_tasks"(id) ON DELETE CASCADE,
  "document_id" uuid REFERENCES "public"."pm_documents"(id) ON DELETE CASCADE,
  "email_status" text NOT NULL DEFAULT 'pending', -- pending | sent | skipped | failed
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "pm_notifications_recipient_idx"
  ON "public"."pm_notifications" ("recipient_user_id", "created_at" DESC);
CREATE INDEX "pm_notifications_unread_idx"
  ON "public"."pm_notifications" ("recipient_user_id")
  WHERE "read_at" IS NULL;

ALTER TABLE "public"."pm_notifications" ENABLE ROW LEVEL SECURITY;

-- A user only ever sees and mutates their own notifications.
CREATE POLICY "pm_notifications_select" ON "public"."pm_notifications"
  FOR SELECT USING (recipient_user_id = auth.uid());
CREATE POLICY "pm_notifications_update" ON "public"."pm_notifications"
  FOR UPDATE USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());
-- Inserts come from server actions running as the acting user; the row is
-- valid as long as the actor is a member of the target workspace.
CREATE POLICY "pm_notifications_insert" ON "public"."pm_notifications"
  FOR INSERT WITH CHECK (pm_is_workspace_member(workspace_id));
CREATE POLICY "pm_notifications_delete" ON "public"."pm_notifications"
  FOR DELETE USING (recipient_user_id = auth.uid());
