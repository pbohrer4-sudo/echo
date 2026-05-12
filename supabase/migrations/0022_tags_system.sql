-- Tags-System nach Briefing 5.x — eigene Tabelle statt text[]-Array.
--
-- Vier feste Cluster (context/topic/value/trigger) helfen sowohl der UI
-- (farbcodierte Chips, Filter pro Cluster) als auch der AI (Reasoning
-- über "wo gehört dieser Mensch hin" wird vergleichbar). 7-Tag-Limit
-- pro Person zwingt zur Pflege — entwickelt sich sonst zu unbrauchbaren
-- Sammlungen mit 30+ vergessenen Werten pro Person.
--
-- Das alte people.tags[] (text[]) BLEIBT in der Tabelle als Lese-
-- Quelle für Backward-Compat. Drop kommt in Phase F nach Verifikation
-- dass alle Read-Pfade auf die neue Struktur umgestellt sind.

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  cluster text not null default 'topic',
  created_by text not null default 'user',
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_cluster_check check (cluster in (
    'context',  -- Wo lebt/arbeitet die Person, Rolle, Gruppenzugehörigkeit
    'topic',    -- Interesse, Branche, Skill, Hobby
    'value',    -- Priorität, Wertschätzung, Kunden-Segment
    'trigger'   -- Aktions-Tag (e.g. "Nachfassen", "Birthday-Card", "Demo geben")
  )),
  constraint tags_created_by_check check (created_by in (
    'user',           -- Patrick manuell hinzugefügt
    'ai_suggested',   -- AI hat vorgeschlagen, User akzeptiert
    'ai_extracted'    -- AI hat aus how_we_met/notes extrahiert
  )),
  constraint tags_name_not_empty check (length(trim(name)) > 0),
  unique (user_id, lower(name))
);

-- Junction-Tabelle. Composite-PK verhindert Duplikat-Zuweisungen.
create table if not exists public.person_tags (
  person_id uuid references public.people(id) on delete cascade not null,
  tag_id uuid references public.tags(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  primary key (person_id, tag_id)
);

alter table public.tags enable row level security;
alter table public.person_tags enable row level security;

-- tags-Policies
drop policy if exists "Users see their tags" on public.tags;
create policy "Users see their tags"
  on public.tags for select
  using (user_id = auth.uid());

drop policy if exists "Users insert their tags" on public.tags;
create policy "Users insert their tags"
  on public.tags for insert
  with check (user_id = auth.uid());

drop policy if exists "Users update their tags" on public.tags;
create policy "Users update their tags"
  on public.tags for update
  using (user_id = auth.uid());

drop policy if exists "Users delete their tags" on public.tags;
create policy "Users delete their tags"
  on public.tags for delete
  using (user_id = auth.uid());

-- person_tags-Policies — joinen über tags.user_id da person_tags selbst
-- kein user_id-Feld hat. RLS auf join-Pfad ist üblich für junction-Tabellen.
drop policy if exists "Users see their person_tags" on public.person_tags;
create policy "Users see their person_tags"
  on public.person_tags for select
  using (exists (
    select 1 from public.tags
    where tags.id = person_tags.tag_id and tags.user_id = auth.uid()
  ));

drop policy if exists "Users insert their person_tags" on public.person_tags;
create policy "Users insert their person_tags"
  on public.person_tags for insert
  with check (exists (
    select 1 from public.tags
    where tags.id = person_tags.tag_id and tags.user_id = auth.uid()
  ));

drop policy if exists "Users delete their person_tags" on public.person_tags;
create policy "Users delete their person_tags"
  on public.person_tags for delete
  using (exists (
    select 1 from public.tags
    where tags.id = person_tags.tag_id and tags.user_id = auth.uid()
  ));

-- 7-Tag-Limit pro Person. Triggers vor INSERT, nicht UPDATE — UPDATE
-- macht nur Sinn auf created_at oder ähnlichem, ändert die Count nicht.
create or replace function public.enforce_person_tag_limit()
returns trigger language plpgsql as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.person_tags
  where person_id = new.person_id;
  if v_count >= 7 then
    raise exception 'Person has reached the maximum of 7 tags (Briefing 5.x)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_person_tag_limit on public.person_tags;
create trigger trg_person_tag_limit
  before insert on public.person_tags
  for each row execute function public.enforce_person_tag_limit();

-- usage_count auto-aktualisieren auf tags wenn neue person_tag entsteht.
create or replace function public.bump_tag_usage()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT') then
    update public.tags set usage_count = usage_count + 1, updated_at = now()
    where id = new.tag_id;
  elsif (TG_OP = 'DELETE') then
    update public.tags set usage_count = greatest(usage_count - 1, 0), updated_at = now()
    where id = old.tag_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_tag_usage_insert on public.person_tags;
create trigger trg_tag_usage_insert
  after insert on public.person_tags
  for each row execute function public.bump_tag_usage();

drop trigger if exists trg_tag_usage_delete on public.person_tags;
create trigger trg_tag_usage_delete
  after delete on public.person_tags
  for each row execute function public.bump_tag_usage();

-- Indizes
create index if not exists idx_tags_user_name on public.tags(user_id, name);
create index if not exists idx_tags_user_cluster on public.tags(user_id, cluster);
create index if not exists idx_person_tags_tag on public.person_tags(tag_id);

-- Daten-Migration: bestehende people.tags[] → tags + person_tags.
-- Idempotent durch on-conflict-clauses. Cluster='topic' Default —
-- AI-Klassifizierung in Phase A2.2 (Suggestion-Flow) später.
do $$
declare
  p record;
  raw_name text;
  norm_name text;
  tag_id_v uuid;
begin
  for p in select id, user_id, tags from public.people
           where tags is not null and array_length(tags, 1) > 0
  loop
    foreach raw_name in array p.tags loop
      norm_name := lower(trim(raw_name));
      if length(norm_name) = 0 then continue; end if;

      -- Tag anlegen oder existierenden finden (idempotent via unique).
      insert into public.tags (user_id, name, cluster, created_by)
      values (p.user_id, norm_name, 'topic', 'user')
      on conflict (user_id, lower(name)) do nothing;

      select id into tag_id_v
      from public.tags
      where user_id = p.user_id and lower(name) = norm_name;

      -- Zuweisung — Trigger erzwingt 7er-Limit, aber im Migrationsfall
      -- hat keine Person mehr als 4 Tags, also greift das nicht.
      insert into public.person_tags (person_id, tag_id)
      values (p.id, tag_id_v)
      on conflict do nothing;
    end loop;
  end loop;
end $$;

notify pgrst, 'reload schema';
