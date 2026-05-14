-- Legacy-Drops aus people (Phase F vorgezogen).
--
-- Patrick-Decision 13. Mai 2026 (Gap-Analyse): „echte Legacy-Drops
-- auch jetzt mit reinnehmen". Alle 23 Spalten, die durch Phase A3-A8
-- bzw. 3-Achsen-Modell ersetzt wurden. Code-Refactor in ~15 Files
-- begleitet diesen Drop — siehe gleichen Commit.
--
-- Was ersetzt was:
--   scope                 → purpose (5 statt 3 Werte, ausdrucksstärker)
--   stakeholder_types     → purpose + tags-Cluster
--   stakeholder_sub_types → purpose + tags
--   strength_score        → depth (5 Stufen aus Briefing)
--   depth_override        → depth + depth_source
--   priority              → suggestions + tags-Cluster reminders
--   priority_bucket       → suggestions
--   priority_set_at       → resolved_at auf suggestions
--   cta                   → suggestions (cta-Type) + tags-Cluster
--   cta_expires_at        → suggestions.resolved_at
--   interests             → tags-Cluster interests (Phase c)
--   tags (text[])         → tags-Tabelle + person_tags (seit 0022)
--   phone                 → phones JSONB[0]
--   email                 → emails JSONB[0]
--   birthday              → important_dates JSONB
--   last_interaction_at   → last_contact_at
--   expected_cadence_days → cadence_days
--   next_best_action      → suggestions
--   notes_summary         → not replaced — selten genutzt
--   geographies           → current_location, home_location
--   avatar_url            → photo_url
--   industry (text)       → industry-Enum (Phase D)
--   job_function (text)   → function-Enum (Phase D)

alter table public.people
  drop column if exists scope cascade,
  drop column if exists stakeholder_types cascade,
  drop column if exists stakeholder_sub_types cascade,
  drop column if exists strength_score cascade,
  drop column if exists depth_override cascade,
  drop column if exists priority cascade,
  drop column if exists priority_bucket cascade,
  drop column if exists priority_set_at cascade,
  drop column if exists cta cascade,
  drop column if exists cta_expires_at cascade,
  drop column if exists interests cascade,
  drop column if exists tags cascade,
  drop column if exists phone cascade,
  drop column if exists email cascade,
  drop column if exists birthday cascade,
  drop column if exists last_interaction_at cascade,
  drop column if exists expected_cadence_days cascade,
  drop column if exists next_best_action cascade,
  drop column if exists notes_summary cascade,
  drop column if exists geographies cascade,
  drop column if exists avatar_url cascade,
  drop column if exists industry cascade,
  drop column if exists job_function cascade;

-- Indizes die auf gedroppte Spalten zeigten cleanen wir auch (cascade
-- sollte das tun, aber explicit ist safer falls Postgres die nicht
-- automatisch erfasst).
drop index if exists public.idx_people_cta_expires;
drop index if exists public.idx_people_interests;
drop index if exists public.idx_people_priority;
drop index if exists public.idx_people_stakeholder_types;
drop index if exists public.idx_people_user_last_interaction;

notify pgrst, 'reload schema';
