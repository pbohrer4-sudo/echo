-- Remove the 7-tag-per-person limit (2026-06-07). Patrick asked for the
-- limit to be removed; it was taken out of the UI but the DB trigger
-- still enforced it, so adding a tag past 7 silently failed ("the tag
-- doesn't show up"). Drop the trigger + its function.
--
-- Run in Supabase SQL Editor.

drop trigger if exists trg_person_tag_limit on public.person_tags;
drop function if exists public.enforce_person_tag_limit();
