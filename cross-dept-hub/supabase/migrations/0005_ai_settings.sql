-- 0050 — Selectable AI behaviour.
--
-- The AI features in the hub are opt-in/opt-out at the workspace level so a
-- team can run the system with as much or as little automation as they want:
--   * ai_enabled        — master switch; when off, no AI runs anywhere and the
--                         AI affordances are hidden (a fully manual hub).
--   * ai_auto_briefing  — auto-generate a briefing when a cross-department
--                         request lands. Off → the inbox keeps the request
--                         exactly as written; a human can still trigger a
--                         briefing manually.
--   * ai_auto_filing    — auto-suggest a SharePoint folder + file name when a
--                         document is added. Off → the document is saved as
--                         entered; a human can still ask for a suggestion.

ALTER TABLE "public"."pm_workspaces"
  ADD COLUMN "ai_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN "ai_auto_briefing" boolean NOT NULL DEFAULT true,
  ADD COLUMN "ai_auto_filing" boolean NOT NULL DEFAULT true;
