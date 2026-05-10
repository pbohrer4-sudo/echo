-- Admin-Dashboard RPC functions. Lesen auth.users + Public-Tables und
-- liefern aggregierte Daten. Werden NUR per Service-Role-Client aus
-- den admin-Routen aufgerufen (gate liegt in lib/admin.ts via
-- ADMIN_EMAILS-env). REVOKE EXECUTE FROM public+authenticated stellt
-- sicher dass normale User die Funktion nicht direkt rufen können —
-- selbst wenn sie die Route umgehen.

create or replace function public.admin_overview_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  result json;
begin
  select json_build_object(
    'total_users', (select count(*) from auth.users),
    'active_7d', (
      select count(*) from auth.users
      where last_sign_in_at >= v_now - interval '7 days'
    ),
    'active_30d', (
      select count(*) from auth.users
      where last_sign_in_at >= v_now - interval '30 days'
    ),
    -- Onboarded = mind. eine angelegte (nicht-self) Person. Heuristik:
    -- wer Personen anlegt, hat ECHO "tatsächlich angefangen zu nutzen".
    'onboarded', (
      select count(distinct user_id) from public.people
      where is_self = false and deleted_at is null
    ),
    'people_total', (
      select count(*) from public.people
      where is_self = false and deleted_at is null
    ),
    'interactions_total', (
      select count(*) from public.interactions
    ),
    'debriefs_total', (
      select count(*) from public.debriefs
    ),
    -- Signups pro Woche, letzte 8 Wochen (Sparkline-Datenquelle)
    'signups_weekly', (
      select coalesce(
        json_agg(
          json_build_object('week', week, 'count', count)
          order by week
        ),
        '[]'::json
      )
      from (
        select date_trunc('week', created_at) as week, count(*) as count
        from auth.users
        where created_at >= v_now - interval '8 weeks'
        group by 1
      ) t
    ),
    -- Letzte 10 Signups mit Email + Onboarded-Status für die "Neu"-Liste
    'recent_signups', (
      select coalesce(
        json_agg(
          json_build_object(
            'id', id,
            'email', email,
            'created_at', created_at,
            'last_sign_in_at', last_sign_in_at,
            'onboarded', onboarded
          )
          order by created_at desc
        ),
        '[]'::json
      )
      from (
        select
          u.id, u.email, u.created_at, u.last_sign_in_at,
          exists(
            select 1 from public.people p
            where p.user_id = u.id
              and p.is_self = false
              and p.deleted_at is null
          ) as onboarded
        from auth.users u
        order by u.created_at desc
        limit 10
      ) t
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.admin_overview_stats() from public;
revoke execute on function public.admin_overview_stats() from authenticated;
revoke execute on function public.admin_overview_stats() from anon;

-- Pro-User-Statistik: für den /admin/users-Tab.
create or replace function public.admin_users_list()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  select coalesce(
    json_agg(
      json_build_object(
        'id', u.id,
        'email', u.email,
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'people_count', coalesce(pc.cnt, 0),
        'interactions_count', coalesce(ic.cnt, 0),
        'debriefs_count', coalesce(dc.cnt, 0),
        'onboarded', coalesce(pc.cnt, 0) > 0
      )
      order by u.created_at desc
    ),
    '[]'::json
  )
  into result
  from auth.users u
  left join (
    select user_id, count(*) as cnt
    from public.people
    where is_self = false and deleted_at is null
    group by user_id
  ) pc on pc.user_id = u.id
  left join (
    select user_id, count(*) as cnt
    from public.interactions
    group by user_id
  ) ic on ic.user_id = u.id
  left join (
    select user_id, count(*) as cnt
    from public.debriefs
    group by user_id
  ) dc on dc.user_id = u.id;
  return result;
end;
$$;

revoke execute on function public.admin_users_list() from public;
revoke execute on function public.admin_users_list() from authenticated;
revoke execute on function public.admin_users_list() from anon;

notify pgrst, 'reload schema';
