-- Multi-model: per-task model preference + per-provider BYO API keys.
-- Catalog metadata (which models exist, prices, capabilities) lives in
-- code (lib/model-catalog.ts) so adding a new provider's row doesn't
-- require a migration.
--
-- model_preferences jsonb shape:
--   {
--     "chat":   "anthropic/claude-sonnet-4-6",
--     "extract":"anthropic/claude-sonnet-4-6",
--     "enrich": "anthropic/claude-sonnet-4-6",
--     "vision": "anthropic/claude-sonnet-4-6",
--     "pulse":  "anthropic/claude-sonnet-4-6",
--     "recap":  "anthropic/claude-sonnet-4-6",
--     "vibe":   "anthropic/claude-sonnet-4-6"
--   }
-- Empty / missing key falls back to a hard-coded default in ai.ts.
--
-- byo_api_keys jsonb shape:
--   { "anthropic": "sk-ant-…", "openai": "sk-…", "google": "AIza…" }
-- Existing claude_key_byo / elevenlabs_key_byo columns stay around for
-- backwards compat — new keys go in this map.
--
-- Run in Supabase SQL Editor.

alter table public.profiles
  add column if not exists model_preferences jsonb not null default '{}'::jsonb,
  add column if not exists byo_api_keys jsonb not null default '{}'::jsonb;
