-- 0018 — Duplicate-merge SQL functions for people + organizations.
--
-- These run server-side as SECURITY DEFINER so the JS layer can call
-- them via supabase.rpc() and we get atomic transactional merges
-- across all the FK tables (interactions, reminders, todos, notes,
-- deals, wa_messages, external_*) plus the JSONB fields on people.
--
-- Both functions enforce ownership: primary + secondary must belong
-- to the same caller (auth.uid()). Returns the primary id on success
-- and raises on any constraint violation so the client gets a clean
-- error rather than a half-merged state.

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

  -- ── Fan-out FK repointing. Always primary wins.
  update public.interactions    set person_id = primary_id where person_id = secondary_id;
  update public.notes           set person_id = primary_id where person_id = secondary_id;
  update public.reminders       set person_id = primary_id where person_id = secondary_id;
  update public.todos           set person_id = primary_id where person_id = secondary_id;
  update public.deals           set person_id = primary_id where person_id = secondary_id;
  update public.wa_messages     set matched_person_id = primary_id where matched_person_id = secondary_id;

  -- Array-typed match columns on the sync tables.
  update public.external_events
    set matched_person_ids = (
      select array_agg(distinct case when x = secondary_id then primary_id else x end)
      from unnest(matched_person_ids) as x
    )
    where secondary_id = any(matched_person_ids);

  update public.external_messages
    set matched_person_ids = (
      select array_agg(distinct case when x = secondary_id then primary_id else x end)
      from unnest(matched_person_ids) as x
    )
    where secondary_id = any(matched_person_ids);

  -- Other people's relationships JSON arrays may reference the dupe.
  -- Rewrite related_person_id within JSONB and remove self-loops.
  update public.people
  set relationships = coalesce((
    select jsonb_agg(rel)
    from jsonb_array_elements(relationships) as rel
    where (rel->>'related_person_id')::uuid <> primary_id
  ), '[]'::jsonb)
  where user_id = caller
    and relationships @> jsonb_build_array(jsonb_build_object('related_person_id', secondary_id));

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

  -- ── Field-level merge into primary.
  -- Scalar fields: prefer primary's existing value, fall back to secondary's.
  -- Array/JSONB fields: union with dedup.
  update public.people
  set
    company = coalesce(p.company, s.company),
    organization_id = coalesce(p.organization_id, s.organization_id),
    role = coalesce(p.role, s.role),
    -- scope: keep primary's
    expected_cadence_days = coalesce(p.expected_cadence_days, s.expected_cadence_days),
    strength_score = coalesce(p.strength_score, s.strength_score),
    last_interaction_at = greatest(p.last_interaction_at, s.last_interaction_at),
    next_best_action = coalesce(p.next_best_action, s.next_best_action),
    birthday = coalesce(p.birthday, s.birthday),
    phone = coalesce(p.phone, s.phone),
    email = coalesce(p.email, s.email),
    notes_summary = coalesce(p.notes_summary, s.notes_summary),
    avatar_url = coalesce(p.avatar_url, s.avatar_url),
    notes = case
      when p.notes is null and s.notes is null then null
      when p.notes is null then s.notes
      when s.notes is null then p.notes
      when p.notes = s.notes then p.notes
      else p.notes || E'\n\n— aus Merge —\n' || s.notes
    end,
    industry = coalesce(p.industry, s.industry),
    job_function = coalesce(p.job_function, s.job_function),
    cta = coalesce(p.cta, s.cta),
    cta_expires_at = coalesce(p.cta_expires_at, s.cta_expires_at),
    priority = coalesce(p.priority, s.priority),
    priority_bucket = coalesce(p.priority_bucket, s.priority_bucket),
    priority_set_at = coalesce(p.priority_set_at, s.priority_set_at),
    depth_override = coalesce(p.depth_override, s.depth_override),
    -- Tags + interests + stakeholder_types: array union with dedup.
    tags = (
      select coalesce(array_agg(distinct t), '{}'::text[])
      from unnest(coalesce(p.tags, '{}') || coalesce(s.tags, '{}')) as t
      where t is not null and t <> ''
    ),
    interests = (
      select coalesce(array_agg(distinct t), '{}'::text[])
      from unnest(coalesce(p.interests, '{}') || coalesce(s.interests, '{}')) as t
      where t is not null and t <> ''
    ),
    stakeholder_types = (
      select coalesce(array_agg(distinct t), '{}'::text[])
      from unnest(coalesce(p.stakeholder_types, '{}') || coalesce(s.stakeholder_types, '{}')) as t
      where t is not null and t <> ''
    ),
    stakeholder_sub_types = coalesce(p.stakeholder_sub_types, '{}'::jsonb)
                          || coalesce(s.stakeholder_sub_types, '{}'::jsonb),
    -- JSONB array fields: dedup by stringified value, primary first so its
    -- entries win on tie. The (->>'value' / ->>'street' / etc.) keys vary
    -- by field so we use the whole element as the dedup key.
    phones = jsonb_dedup(coalesce(p.phones, '[]') || coalesce(s.phones, '[]')),
    emails = jsonb_dedup(coalesce(p.emails, '[]') || coalesce(s.emails, '[]')),
    addresses = jsonb_dedup(coalesce(p.addresses, '[]') || coalesce(s.addresses, '[]')),
    socials = jsonb_dedup(coalesce(p.socials, '[]') || coalesce(s.socials, '[]')),
    important_dates = jsonb_dedup(coalesce(p.important_dates, '[]') || coalesce(s.important_dates, '[]')),
    relationships = jsonb_dedup(coalesce(p.relationships, '[]') || coalesce(s.relationships, '[]')),
    geographies = jsonb_dedup(coalesce(p.geographies, '[]') || coalesce(s.geographies, '[]')),
    updated_at = now()
  where id = primary_id;

  -- ── Soft-delete the secondary so RLS-filtered list views drop it.
  update public.people
  set deleted_at = now(), updated_at = now()
  where id = secondary_id;

  return primary_id;
end;
$$;

-- Helper: dedup a JSONB array by exact element equality. Stable order
-- is preserved (first occurrence wins).
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

  -- Repoint people + deals to the primary.
  update public.people set organization_id = primary_id where organization_id = secondary_id;
  update public.deals  set organization_id = primary_id where organization_id = secondary_id;

  -- Field-level merge.
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
    updated_at = now()
  where id = primary_id;

  update public.organizations
  set deleted_at = now(), updated_at = now()
  where id = secondary_id;

  return primary_id;
end;
$$;

-- Permissions: any authenticated user can call these. Authorization
-- is enforced inside the function via auth.uid() vs row.user_id.
revoke all on function public.merge_people(uuid, uuid) from public;
grant execute on function public.merge_people(uuid, uuid) to authenticated;

revoke all on function public.merge_organizations(uuid, uuid) from public;
grant execute on function public.merge_organizations(uuid, uuid) to authenticated;
