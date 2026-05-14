-- 0031 — merge_people / merge_organizations für V3-Schema neu auflegen.
--
-- Die Originale aus 0018 referenzierten Spalten + Tabellen die in
-- 0025 (Legacy-Drops) und 0030 (V3-strukturierte Tabellen) verschwunden
-- sind: expected_cadence_days, strength_score, last_interaction_at,
-- next_best_action, birthday/phone/email-Scalars, notes_summary,
-- avatar_url, industry, job_function, cta*, priority*, depth_override,
-- interests, stakeholder_types, stakeholder_sub_types, geographies
-- (alles auf people gedroppt). Plus wa_messages und external_events/
-- _messages — Tabellen die nicht mehr existieren.
--
-- Diese Migration ersetzt beide Funktionen mit Bezug aufs aktuelle
-- Schema und erweitert merge_people um die V3-Junction-Tabellen
-- (person_contacts/person_geographies/person_relationships/
-- person_tags/passions/person_circles/person_life_events).

-- jsonb_dedup ist idempotent — von 0018 vielleicht noch da, oder weg.
create or replace function public.jsonb_dedup(arr jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
  from (
    select distinct on (elem) elem, ord
    from (
      select value as elem, ordinality as ord
      from jsonb_array_elements(arr) with ordinality
    ) t
    order by elem, ord
  ) deduped;
$$;

-- ─────────────────────── merge_people ───────────────────────

create or replace function public.merge_people(
  primary_id uuid,
  secondary_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  p public.people;
  s public.people;
begin
  if primary_id = secondary_id then
    raise exception 'Cannot merge a person with itself';
  end if;
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into p from public.people where id = primary_id;
  if not found then raise exception 'Primary person not found'; end if;
  if p.user_id <> caller then raise exception 'Forbidden (primary)'; end if;

  select * into s from public.people where id = secondary_id;
  if not found then raise exception 'Secondary person not found'; end if;
  if s.user_id <> caller then raise exception 'Forbidden (secondary)'; end if;

  -- ── FK-Repointing: interactions (person_ids[] uuid-Array) ──
  update public.interactions
  set person_ids = (
    select array_agg(distinct case when x = secondary_id then primary_id else x end)
    from unnest(person_ids) as x
  )
  where secondary_id = any(person_ids);

  -- ── FK-Repointing: 1:N-Tabellen ──
  update public.notes       set person_id = primary_id where person_id = secondary_id;
  update public.reminders   set person_id = primary_id where person_id = secondary_id;
  update public.todos       set person_id = primary_id where person_id = secondary_id;
  update public.deals       set person_id = primary_id where person_id = secondary_id;
  update public.suggestions set person_id = primary_id where person_id = secondary_id;

  -- ── Junction mit composite-unique: erst Konflikte raus, dann update ──
  -- person_tags (person_id, tag_id)
  delete from public.person_tags
  where person_id = secondary_id
    and tag_id in (select tag_id from public.person_tags where person_id = primary_id);
  update public.person_tags set person_id = primary_id where person_id = secondary_id;

  -- passions (person_id, lower(name)) unique-index
  delete from public.passions
  where person_id = secondary_id
    and lower(name) in (
      select lower(name) from public.passions where person_id = primary_id
    );
  update public.passions set person_id = primary_id where person_id = secondary_id;

  -- person_circles (person_id, circle_id)
  delete from public.person_circles
  where person_id = secondary_id
    and circle_id in (select circle_id from public.person_circles where person_id = primary_id);
  update public.person_circles set person_id = primary_id where person_id = secondary_id;

  -- person_life_events (person_id, life_event_id)
  delete from public.person_life_events
  where person_id = secondary_id
    and life_event_id in (
      select life_event_id from public.person_life_events where person_id = primary_id
    );
  update public.person_life_events set person_id = primary_id where person_id = secondary_id;

  -- person_contacts, person_geographies: keine composite-unique, einfach repointen
  update public.person_contacts    set person_id = primary_id where person_id = secondary_id;
  update public.person_geographies set person_id = primary_id where person_id = secondary_id;

  -- person_relationships: unique (person_id, related_person_id, relationship_type)
  --   + check: related_person_id darf nicht auf sich selbst zeigen
  -- Erst person_id-Seite des Repoints:
  delete from public.person_relationships
  where person_id = secondary_id
    and (
      related_person_id = primary_id  -- würde self-loop nach Repoint
      or (related_person_id, relationship_type) in (
        select related_person_id, relationship_type
        from public.person_relationships where person_id = primary_id
      )
    );
  update public.person_relationships set person_id = primary_id where person_id = secondary_id;

  -- Dann related_person_id-Seite:
  delete from public.person_relationships
  where related_person_id = secondary_id
    and (
      person_id = primary_id  -- self-loop
      or (person_id, relationship_type) in (
        select person_id, relationship_type
        from public.person_relationships where related_person_id = primary_id
      )
    );
  update public.person_relationships set related_person_id = primary_id where related_person_id = secondary_id;

  -- ── JSONB-Beziehungen auf anderen people umschreiben ──
  -- Erst die Fälle wo BEIDES (primary + secondary) drin steht — primary-
  -- Entries werden behalten, secondary fällt mit der nächsten Pass weg.
  update public.people
  set relationships = coalesce((
    select jsonb_agg(rel)
    from jsonb_array_elements(relationships) as rel
    where (rel->>'related_person_id')::uuid <> primary_id
  ), '[]'::jsonb)
  where user_id = caller
    and relationships @> jsonb_build_array(jsonb_build_object('related_person_id', secondary_id))
    and relationships @> jsonb_build_array(jsonb_build_object('related_person_id', primary_id));

  -- Dann secondary → primary umschreiben.
  update public.people
  set relationships = coalesce((
    select jsonb_agg(
      case
        when (rel->>'related_person_id')::uuid = secondary_id
          then jsonb_set(rel, '{related_person_id}', to_jsonb(primary_id::text))
        else rel
      end
    )
    from jsonb_array_elements(relationships) as rel
  ), '[]'::jsonb)
  where user_id = caller
    and relationships @> jsonb_build_array(jsonb_build_object('related_person_id', secondary_id));

  -- ── Field-Level-Merge in primary ──
  update public.people
  set
    -- Scalars: primary wins, fallback auf secondary.
    company = coalesce(p.company, s.company),
    organization_id = coalesce(p.organization_id, s.organization_id),
    role = coalesce(p.role, s.role),
    notes = case
      when p.notes is null and s.notes is null then null
      when p.notes is null then s.notes
      when s.notes is null then p.notes
      when p.notes = s.notes then p.notes
      else p.notes || E'\n\n— aus Merge —\n' || s.notes
    end,
    how_we_met = coalesce(p.how_we_met, s.how_we_met),
    met_date = coalesce(p.met_date, s.met_date),
    met_location = coalesce(p.met_location, s.met_location),
    met_location_geo = coalesce(p.met_location_geo, s.met_location_geo),
    current_location = coalesce(p.current_location, s.current_location),
    current_location_geo = coalesce(p.current_location_geo, s.current_location_geo),
    home_location = coalesce(p.home_location, s.home_location),
    home_location_geo = coalesce(p.home_location_geo, s.home_location_geo),
    depth = coalesce(p.depth, s.depth),
    depth_source = p.depth_source, -- primary's source bleibt
    purpose = coalesce(p.purpose, s.purpose),
    -- mode: primary behält seinen Wert (NOT NULL).
    next_nudge_at = greatest(p.next_nudge_at, s.next_nudge_at),
    last_contact_at = greatest(p.last_contact_at, s.last_contact_at),
    cadence_days = coalesce(p.cadence_days, s.cadence_days),
    linkedin_url = coalesce(p.linkedin_url, s.linkedin_url),
    photo_url = coalesce(p.photo_url, s.photo_url),
    -- JSONB-Arrays: dedup union.
    phones          = jsonb_dedup(coalesce(p.phones, '[]')          || coalesce(s.phones, '[]')),
    emails          = jsonb_dedup(coalesce(p.emails, '[]')          || coalesce(s.emails, '[]')),
    addresses       = jsonb_dedup(coalesce(p.addresses, '[]')       || coalesce(s.addresses, '[]')),
    socials         = jsonb_dedup(coalesce(p.socials, '[]')         || coalesce(s.socials, '[]')),
    important_dates = jsonb_dedup(coalesce(p.important_dates, '[]') || coalesce(s.important_dates, '[]')),
    relationships   = jsonb_dedup(coalesce(p.relationships, '[]')   || coalesce(s.relationships, '[]')),
    updated_at = now()
  where id = primary_id;

  -- ── Secondary soft-deleten ──
  update public.people
  set deleted_at = now(), updated_at = now()
  where id = secondary_id;

  return primary_id;
end;
$$;

-- ─────────────────────── merge_organizations ────────────────

create or replace function public.merge_organizations(
  primary_id uuid,
  secondary_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  p public.organizations;
  s public.organizations;
begin
  if primary_id = secondary_id then
    raise exception 'Cannot merge an organization with itself';
  end if;
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into p from public.organizations where id = primary_id;
  if not found then raise exception 'Primary organization not found'; end if;
  if p.user_id <> caller then raise exception 'Forbidden (primary)'; end if;

  select * into s from public.organizations where id = secondary_id;
  if not found then raise exception 'Secondary organization not found'; end if;
  if s.user_id <> caller then raise exception 'Forbidden (secondary)'; end if;

  -- Repoint FK
  update public.people set organization_id = primary_id where organization_id = secondary_id;
  update public.deals  set organization_id = primary_id where organization_id = secondary_id;

  -- Field-Level-Merge.
  update public.organizations
  set
    domain = coalesce(p.domain, s.domain),
    website = coalesce(p.website, s.website),
    industry = coalesce(p.industry, s.industry),
    size = coalesce(p.size, s.size),
    hq = coalesce(p.hq, s.hq),
    description = coalesce(p.description, s.description),
    notes = case
      when p.notes is null and s.notes is null then null
      when p.notes is null then s.notes
      when s.notes is null then p.notes
      when p.notes = s.notes then p.notes
      else p.notes || E'\n\n— aus Merge —\n' || s.notes
    end,
    tags = (
      select coalesce(array_agg(distinct t), '{}'::text[])
      from unnest(coalesce(p.tags, '{}') || coalesce(s.tags, '{}')) as t
      where t is not null and t <> ''
    ),
    enriched_at = greatest(p.enriched_at, s.enriched_at),
    updated_at = now()
  where id = primary_id;

  update public.organizations
  set deleted_at = now(), updated_at = now()
  where id = secondary_id;

  return primary_id;
end;
$$;

-- Berechtigungen.
revoke all on function public.merge_people(uuid, uuid) from public;
grant execute on function public.merge_people(uuid, uuid) to authenticated;

revoke all on function public.merge_organizations(uuid, uuid) from public;
grant execute on function public.merge_organizations(uuid, uuid) to authenticated;
