-- Tag-Cluster v3 (Briefing v3 Section 19): vier neue Cluster +
-- separate Tabellen für passions (max 5 pro Person) und circles
-- (Communities/Organisationen).
--
-- Cluster-Wechsel: context/topic/value/trigger → reminders/interests/
--   potential/origin. Da wir nach 0025 0 Tags in der DB haben, ist
--   die Migration trivial (CHECK-Constraint umtauschen, keine Daten-
--   Anpassung). Falls später Daten existieren: jeder existierende
--   Tag muesste auf einen der neuen Werte gemapped werden.

-- ============================================================
-- 1. tags-Tabelle: neuer Cluster-Constraint
-- ============================================================

alter table public.tags drop constraint if exists tags_cluster_check;
alter table public.tags add constraint tags_cluster_check
  check (cluster in (
    'reminders',  -- Geburtstage, Follow-ups, Lebensereignisse (Briefing v3 #19)
    'interests',  -- Themen, Skills, Berufliches
    'potential',  -- Give/Get/Both — was zwischen euch möglich ist
    'origin'      -- Beziehungs-Herkunft (über wen kennengelernt etc.)
  ));

-- Default fuer neue Tags umstellen.
alter table public.tags alter column cluster set default 'interests';

-- ============================================================
-- 2. passions-Tabelle (Briefing v3 Section 19)
-- ============================================================
-- Identitätsstiftende Interessen pro Person. Max 5 pro Person — der
-- Briefing-Hard-Cap als DB-Trigger erzwungen. Eigene Tabelle (nicht
-- als tags-Cluster) weil das 5er-Limit datenbankseitig leichter
-- enforcable ist und Passions getrennt von „normalen" Tags rangieren.

create table if not exists public.passions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  person_id uuid references public.people(id) on delete cascade not null,
  name text not null,
  created_at timestamptz not null default now(),
  constraint passions_name_not_empty check (length(trim(name)) > 0)
);

-- Case-insensitive unique constraint via expression index. Inline-
-- UNIQUE-Constraints in Postgres erlauben keine Funktionsaufrufe.
create unique index if not exists idx_passions_person_lower_name
  on public.passions (person_id, lower(name));

create index if not exists idx_passions_person on public.passions(person_id);
create index if not exists idx_passions_user on public.passions(user_id);

alter table public.passions enable row level security;

drop policy if exists "Users see their passions" on public.passions;
create policy "Users see their passions"
  on public.passions for select using (user_id = auth.uid());

drop policy if exists "Users insert their passions" on public.passions;
create policy "Users insert their passions"
  on public.passions for insert with check (user_id = auth.uid());

drop policy if exists "Users update their passions" on public.passions;
create policy "Users update their passions"
  on public.passions for update using (user_id = auth.uid());

drop policy if exists "Users delete their passions" on public.passions;
create policy "Users delete their passions"
  on public.passions for delete using (user_id = auth.uid());

-- 5-Passion-Limit pro Person via Trigger
create or replace function public.enforce_person_passion_limit()
returns trigger language plpgsql as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.passions
  where person_id = new.person_id;
  if v_count >= 5 then
    raise exception 'Person has reached the maximum of 5 passions (Briefing v3)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_person_passion_limit on public.passions;
create trigger trg_person_passion_limit
  before insert on public.passions
  for each row execute function public.enforce_person_passion_limit();

-- ============================================================
-- 3. circles-Tabelle (Briefing v3 Section 19)
-- ============================================================
-- Communities und Organisationen, denen Personen angehören. Z.B.
-- „Munich Founder Network", „YC W22", „Bauma 2024 Attendees".
-- Mit eigener Membership-Junction (person_circles).

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circles_name_not_empty check (length(trim(name)) > 0)
);

-- Case-insensitive unique constraint als expression index.
create unique index if not exists idx_circles_user_lower_name
  on public.circles (user_id, lower(name));

create index if not exists idx_circles_user on public.circles(user_id);

alter table public.circles enable row level security;

drop policy if exists "Users see their circles" on public.circles;
create policy "Users see their circles"
  on public.circles for select using (user_id = auth.uid());

drop policy if exists "Users insert their circles" on public.circles;
create policy "Users insert their circles"
  on public.circles for insert with check (user_id = auth.uid());

drop policy if exists "Users update their circles" on public.circles;
create policy "Users update their circles"
  on public.circles for update using (user_id = auth.uid());

drop policy if exists "Users delete their circles" on public.circles;
create policy "Users delete their circles"
  on public.circles for delete using (user_id = auth.uid());

-- ============================================================
-- 4. person_circles Junction
-- ============================================================

create table if not exists public.person_circles (
  person_id uuid references public.people(id) on delete cascade not null,
  circle_id uuid references public.circles(id) on delete cascade not null,
  added_at timestamptz not null default now(),
  primary key (person_id, circle_id)
);

create index if not exists idx_person_circles_circle on public.person_circles(circle_id);

alter table public.person_circles enable row level security;

drop policy if exists "Users see their person_circles" on public.person_circles;
create policy "Users see their person_circles"
  on public.person_circles for select
  using (exists (
    select 1 from public.circles
    where circles.id = person_circles.circle_id and circles.user_id = auth.uid()
  ));

drop policy if exists "Users insert their person_circles" on public.person_circles;
create policy "Users insert their person_circles"
  on public.person_circles for insert
  with check (exists (
    select 1 from public.circles
    where circles.id = person_circles.circle_id and circles.user_id = auth.uid()
  ));

drop policy if exists "Users delete their person_circles" on public.person_circles;
create policy "Users delete their person_circles"
  on public.person_circles for delete
  using (exists (
    select 1 from public.circles
    where circles.id = person_circles.circle_id and circles.user_id = auth.uid()
  ));

notify pgrst, 'reload schema';
