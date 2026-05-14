-- Migration: create Supabase Storage buckets needed by the app
-- Buckets are inserted directly into storage.buckets; policies use
-- storage.objects RLS (path convention: {user_id}/{file}).

-- ── life-events bucket ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'life-events',
  'life-events',
  false,
  26214400,   -- 25 MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'application/pdf',
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav',
    'video/mp4', 'video/webm',
    'text/plain'
  ]
)
on conflict (id) do update
  set file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- RLS: each user can only read/write their own folder (first path segment = user_id)
create policy "life-events: owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'life-events'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "life-events: owner select"
  on storage.objects for select
  using (
    bucket_id = 'life-events'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "life-events: owner update"
  on storage.objects for update
  using (
    bucket_id = 'life-events'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "life-events: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'life-events'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── avatars bucket (if not yet created) ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,    -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- DOWN
-- delete from storage.buckets where id = 'life-events';
-- delete from storage.buckets where id = 'avatars';
-- (policies are dropped automatically when the bucket row is deleted)
