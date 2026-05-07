-- Per-workflow default model preferences. Resolution chain at runtime:
--
--   node.config.model_id     (per-node override)
--   workflow.default_model_preferences[task]   (this column)
--   profile.model_preferences[task]            (user-wide)
--   TASKS.find(t => t.id === task).default_model  (catalog default)
--
-- Lets the user pick e.g. Perplexity for a Business workflow's chat
-- step, ChatGPT for a Personal workflow, and override Mistral on a
-- single image-recognition transform inside either.
--
-- Run in Supabase SQL Editor.

alter table public.workflows
  add column if not exists default_model_preferences jsonb not null default '{}'::jsonb;
