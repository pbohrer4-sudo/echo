-- Erweitert die provider-CHECK-Constraint im llm_usage_log auf mistral
-- und openai. Visitenkarten-Scan läuft seit Phase X auf Mistral OCR
-- (lib/business-card.ts), und das Logging schlug bisher mit einem
-- check-violation fehl weil nur ('anthropic','elevenlabs') erlaubt war.

alter table llm_usage_log
  drop constraint if exists llm_usage_log_provider_check;

alter table llm_usage_log
  add constraint llm_usage_log_provider_check
  check (provider in ('anthropic', 'elevenlabs', 'mistral', 'openai'));
