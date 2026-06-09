-- Personal API tokens (2026-06-09).
--
-- Purpose: let non-browser integrations (the Siri / Apple Shortcuts voice
-- capture, and any future personal automation) authenticate against Echo
-- without a Supabase session cookie. The browser app keeps using cookie
-- auth; this table is ONLY for headless callers that send
--   Authorization: Bearer echo_<token>
--
-- Security model:
--   - We never store the raw token. Only its SHA-256 hash (token_hash).
--     The plaintext is shown exactly once at creation time and then lost.
--   - token_prefix keeps the first few visible chars so the user can tell
--     two tokens apart in a settings list ("echo_a1b2…").
--   - Revocation is a soft state via revoked_at; we keep the row for the
--     audit trail (last_used_at) rather than hard-deleting.
--   - Resolution happens server-side with the service-role client
--     (lib/api-token.ts), which looks the hash up and maps it to user_id.
--     The user_id is NEVER taken from the request body.
--
-- RLS: a user can see / revoke their own tokens from the app. Inserts go
-- through a Server Action that sets user_id = auth.uid(). The headless
-- resolution path uses the service-role key and bypasses RLS by design.

create table if not exists public.api_tokens (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null default array['capture']::text[],
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_api_tokens_user on public.api_tokens (user_id);
create index if not exists idx_api_tokens_hash on public.api_tokens (token_hash);

alter table public.api_tokens enable row level security;

drop policy if exists "Users see their api tokens" on public.api_tokens;
create policy "Users see their api tokens"
  on public.api_tokens for select
  using (user_id = auth.uid());

drop policy if exists "Users insert their api tokens" on public.api_tokens;
create policy "Users insert their api tokens"
  on public.api_tokens for insert
  with check (user_id = auth.uid());

drop policy if exists "Users update their api tokens" on public.api_tokens;
create policy "Users update their api tokens"
  on public.api_tokens for update
  using (user_id = auth.uid());

drop policy if exists "Users delete their api tokens" on public.api_tokens;
create policy "Users delete their api tokens"
  on public.api_tokens for delete
  using (user_id = auth.uid());

-- updated_at auto-touch. update_updated_at_column() is defined in
-- 0001_initial_schema.sql.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
    execute 'create trigger set_updated_at before update on public.api_tokens
               for each row execute function update_updated_at_column()';
  end if;
end $$;

notify pgrst, 'reload schema';

-- DOWN
-- drop trigger if exists set_updated_at on public.api_tokens;
-- drop policy if exists "Users see their api tokens" on public.api_tokens;
-- drop policy if exists "Users insert their api tokens" on public.api_tokens;
-- drop policy if exists "Users update their api tokens" on public.api_tokens;
-- drop policy if exists "Users delete their api tokens" on public.api_tokens;
-- drop index if exists public.idx_api_tokens_hash;
-- drop index if exists public.idx_api_tokens_user;
-- drop table if exists public.api_tokens;
