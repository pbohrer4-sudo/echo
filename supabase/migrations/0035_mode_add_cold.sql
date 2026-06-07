-- Add "cold" to the relationship Mode axis.
--
-- The Mode axis (Briefing 4.3) previously had: active, nurture, dormant,
-- reconnect, archive. "cold" sits between nurture and dormant — an
-- explicitly cold/distant relationship (low warmth) that the user wants
-- to mark deliberately, distinct from "dormant" (just quiet) or
-- "archive" (out of active view).
--
-- Idempotent: drop + re-add the CHECK with the expanded value set.
--
-- Run in Supabase SQL Editor.

alter table public.people drop constraint if exists people_mode_check;
alter table public.people add constraint people_mode_check
  check (mode in ('active', 'nurture', 'cold', 'dormant', 'reconnect', 'archive'));
