-- Stripe Subscription State. Wird ausschließlich vom Webhook-Handler
-- (/api/webhooks/stripe) via Service-Role-Client gepflegt — User
-- können sehen aber nicht schreiben (insert/update/delete-Policies
-- existieren bewusst nicht).
--
-- stripe_customer_id wandert zusätzlich auf profiles für O(1)-Lookup
-- vom Webhook ohne Tabellen-Scan.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  tier text check (tier in ('starter', 'pro', 'team')),
  status text not null check (status in (
    'active', 'past_due', 'canceled', 'incomplete',
    'incomplete_expired', 'trialing', 'unpaid', 'paused'
  )),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  -- Monatlich normalisierter Betrag in Cent (für MRR). Bei Jahres-
  -- Plänen wird unit_amount durch 12 geteilt.
  amount_cents integer,
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "Users see own subscriptions" on public.subscriptions;
create policy "Users see own subscriptions"
  on public.subscriptions for select
  using (user_id = auth.uid());

-- Bewusst KEINE insert/update/delete-Policies: nur Service-Role
-- (Webhook) modifiziert.

create index if not exists idx_subscriptions_user
  on public.subscriptions (user_id);
create index if not exists idx_subscriptions_customer
  on public.subscriptions (stripe_customer_id);
create index if not exists idx_subscriptions_status_active
  on public.subscriptions (status)
  where status = 'active';
create index if not exists idx_subscriptions_canceled_recent
  on public.subscriptions (canceled_at)
  where canceled_at is not null;

-- Profile bekommt stripe_customer_id für schnellen Webhook-Lookup
-- (customer.created/updated kommt vor subscription.created und der
-- Handler muss vom Customer auf den User mappen).
alter table public.profiles
  add column if not exists stripe_customer_id text;

create unique index if not exists uq_profiles_stripe_customer
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- Admin RPC für die Subscription-Karten im Admin-Dashboard.
create or replace function public.admin_subscription_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'active_count', (
      select count(*) from public.subscriptions where status = 'active'
    ),
    'trialing_count', (
      select count(*) from public.subscriptions where status = 'trialing'
    ),
    'past_due_count', (
      select count(*) from public.subscriptions where status = 'past_due'
    ),
    'canceled_count', (
      select count(*) from public.subscriptions where status = 'canceled'
    ),
    'mrr_cents', (
      -- Aktive + trialing Subs, amount_cents schon normalisiert.
      select coalesce(sum(amount_cents), 0) from public.subscriptions
      where status in ('active', 'trialing')
    ),
    'by_tier', (
      select coalesce(json_object_agg(tier, cnt), '{}'::json) from (
        select coalesce(tier, 'unknown') as tier, count(*) as cnt
        from public.subscriptions
        where status in ('active', 'trialing')
        group by 1
      ) t
    ),
    'churned_last_30d', (
      select count(*) from public.subscriptions
      where status = 'canceled'
        and canceled_at >= now() - interval '30 days'
    ),
    'new_last_30d', (
      select count(*) from public.subscriptions
      where created_at >= now() - interval '30 days'
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.admin_subscription_stats() from public;
revoke execute on function public.admin_subscription_stats() from authenticated;
revoke execute on function public.admin_subscription_stats() from anon;

notify pgrst, 'reload schema';
