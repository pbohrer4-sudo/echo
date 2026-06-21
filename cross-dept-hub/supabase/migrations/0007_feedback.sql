-- 0052 — In-app feedback capture for the hub trial.
--
-- Lets testers jot "what needs improvement" notes from inside the app while
-- they use it. Visible to the whole workspace so feedback can be triaged
-- together.

CREATE TABLE "public"."pm_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "public"."pm_workspaces"(id) ON DELETE CASCADE,
  "user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "area" text,
  "sentiment" text,
  "message" text NOT NULL,
  "page_url" text,
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "pm_feedback_workspace_idx"
  ON "public"."pm_feedback" ("workspace_id", "created_at" DESC);

ALTER TABLE "public"."pm_feedback" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pm_feedback_all" ON "public"."pm_feedback"
  FOR ALL USING (pm_is_workspace_member(workspace_id))
  WITH CHECK (pm_is_workspace_member(workspace_id));
