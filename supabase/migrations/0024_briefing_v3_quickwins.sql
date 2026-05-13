-- Briefing v3 Quick-Wins (Phase b nach Gap-Analyse):
--   1. interactions.external_id für Gmail/Calendar-Sync (Briefing 5.x)
--   2. Drop unused new columns aus 0023: first_name, last_name, met_event
--      (Patrick-Decision: v3 will diese nicht, kein Consumer-Code aktuell)
--
-- Pipelines-Hide passiert nicht hier (UI-only, kein Schema-Change).

-- ============================================================
-- 1. external_id auf interactions
-- ============================================================
-- Gmail-Message-ID / Calendar-Event-ID. Unique-per-User damit
-- doppelte Webhooks idempotent ignoriert werden.

alter table public.interactions
  add column if not exists external_id text;

create unique index if not exists uniq_interactions_external_id
  on public.interactions (user_id, external_id)
  where external_id is not null;

-- ============================================================
-- 2. Drop unused columns aus 0023
-- ============================================================
-- Patrick hat in Gap-Analyse entschieden: first_name + last_name
-- droppen (v3 Section 24 #3), met_event droppen (Konsens aus
-- "met_event ist redundant zum how_we_met-Freitext").
-- met_date und met_location bleiben.

alter table public.people
  drop column if exists first_name,
  drop column if exists last_name,
  drop column if exists met_event;

-- ============================================================
-- 3. PostgREST reload
-- ============================================================
notify pgrst, 'reload schema';
