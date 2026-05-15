-- Datei-Anhänge an interactions (Timeline-Events). Use-Case: Meeting-
-- Transkripte als .txt/.md/.pdf hochladen. Der Text landet im
-- transcript-Feld (bereits vorhanden) damit der LLM-Kontext-Loader
-- ihn beim nächsten Voice-Turn mitliest. Files leben im existing
-- 'life-events' Storage-Bucket (gleicher MIME-Whitelist).

alter table interactions
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_size_bytes int,
  add column if not exists mime_type text;

comment on column interactions.file_path is
  'Pfad in Supabase Storage (life-events Bucket): {user_id}/interactions/{interaction_id}/{filename}';
comment on column interactions.transcript is
  'Extrahierter Text aus dem hochgeladenen File. Geht in den LLM-Kontext via loadPeopleContext.';
