set check_function_bodies = off;

create extension if not exists pgcrypto;

alter table public.creator_profiles
  add column if not exists follower_count integer not null default 0;

create table if not exists public.creator_follows (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  follower_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_follows_status_check check (status in ('active', 'muted', 'blocked')),
  constraint creator_follows_creator_follower_key unique (creator_id, follower_id),
  constraint creator_follows_self_check check (creator_id <> follower_id)
);

create table if not exists public.creator_membership_plans (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  tier_code text not null default 'premium',
  name text not null default 'Premium',
  description text null,
  billing_period text not null,
  interval_unit text not null,
  interval_count integer not null,
  price numeric(10,2) not null,
  currency text not null default 'brl',
  stripe_product_id text null,
  stripe_price_id text null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_membership_plans_tier_code_check check (tier_code in ('premium')),
  constraint creator_membership_plans_billing_period_check check (billing_period in ('month', 'quarter', 'semester', 'year')),
  constraint creator_membership_plans_interval_unit_check check (interval_unit in ('month', 'year')),
  constraint creator_membership_plans_interval_count_check check (interval_count > 0),
  constraint creator_membership_plans_price_check check (price >= 0),
  constraint creator_membership_plans_unique_period unique (creator_id, tier_code, billing_period)
);

create table if not exists public.creator_memberships (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid null references public.creator_membership_plans(id) on delete set null,
  stripe_subscription_id text null,
  stripe_customer_id text null,
  status text not null default 'active',
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  grace_until timestamptz null,
  last_checkout_session_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_memberships_status_check check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  constraint creator_memberships_creator_user_key unique (creator_id, user_id),
  constraint creator_memberships_self_check check (creator_id <> user_id)
);

create unique index if not exists creator_memberships_stripe_subscription_id_key
  on public.creator_memberships (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.creator_membership_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  membership_id uuid null references public.creator_memberships(id) on delete set null,
  plan_id uuid null references public.creator_membership_plans(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint creator_membership_events_event_type_check check (
    event_type in (
      'follow_created',
      'follow_removed',
      'checkout_started',
      'checkout_completed',
      'subscription_activated',
      'renewal_succeeded',
      'renewal_failed',
      'cancel_scheduled',
      'canceled',
      'reactivated',
      'billing_period_changed'
    )
  )
);

create index if not exists creator_follows_follower_created_idx
  on public.creator_follows (follower_id, created_at desc);

create index if not exists creator_follows_creator_status_idx
  on public.creator_follows (creator_id, status);

create index if not exists creator_memberships_creator_status_idx
  on public.creator_memberships (creator_id, status, current_period_end desc);

create index if not exists creator_memberships_user_status_idx
  on public.creator_memberships (user_id, status, current_period_end desc);

create index if not exists creator_membership_plans_creator_active_order_idx
  on public.creator_membership_plans (creator_id, is_active, display_order, billing_period);

create index if not exists creator_membership_events_creator_created_idx
  on public.creator_membership_events (creator_id, created_at desc);

create index if not exists creator_membership_events_user_created_idx
  on public.creator_membership_events (user_id, created_at desc);

create index if not exists posts_creator_visibility_published_idx
  on public.posts (creator_id, visibility, published_at desc);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_creator_follows_updated_at on public.creator_follows;
create trigger set_creator_follows_updated_at
before update on public.creator_follows
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_creator_membership_plans_updated_at on public.creator_membership_plans;
create trigger set_creator_membership_plans_updated_at
before update on public.creator_membership_plans
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_creator_memberships_updated_at on public.creator_memberships;
create trigger set_creator_memberships_updated_at
before update on public.creator_memberships
for each row execute function public.set_current_timestamp_updated_at();

create or replace function public.is_creator_membership_active(
  p_status text,
  p_current_period_end timestamptz,
  p_grace_until timestamptz
)
returns boolean
language sql
stable
as $$
  select case
    when p_status in ('active', 'trialing') then true
    when p_status = 'past_due' and coalesce(p_grace_until, p_current_period_end) > now() then true
    else false
  end;
$$;

create or replace function public.sync_creator_profile_counts(p_creator_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_follower_count integer := 0;
  v_subscriber_count integer := 0;
begin
  select count(*)
    into v_follower_count
  from public.creator_follows
  where creator_id = p_creator_id
    and status = 'active';

  select count(*)
    into v_subscriber_count
  from public.creator_memberships
  where creator_id = p_creator_id
    and public.is_creator_membership_active(status, current_period_end, grace_until);

  update public.creator_profiles
  set follower_count = coalesce(v_follower_count, 0),
      subscriber_count = coalesce(v_subscriber_count, 0)
  where id = p_creator_id;
end;
$$;

create or replace function public.handle_creator_follow_count_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_creator_profile_counts(coalesce(new.creator_id, old.creator_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.handle_creator_membership_count_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_creator_profile_counts(coalesce(new.creator_id, old.creator_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists creator_follows_sync_counts on public.creator_follows;
create trigger creator_follows_sync_counts
after insert or update or delete on public.creator_follows
for each row execute function public.handle_creator_follow_count_change();

drop trigger if exists creator_memberships_sync_counts on public.creator_memberships;
create trigger creator_memberships_sync_counts
after insert or update or delete on public.creator_memberships
for each row execute function public.handle_creator_membership_count_change();

create or replace function public.resolve_creator_access(
  p_creator_id uuid,
  p_user_id uuid default auth.uid()
)
returns table (
  creator_id uuid,
  user_id uuid,
  is_following boolean,
  is_paid_member boolean,
  active_plan_id uuid,
  membership_status text,
  cancel_at_period_end boolean,
  current_period_end timestamptz,
  follower_count integer,
  subscriber_count integer,
  can_view_public boolean,
  can_view_paid_members boolean,
  qualifies_for_member_pricing boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with relationship as (
    select
      p_creator_id as creator_id,
      p_user_id as user_id,
      exists(
        select 1
        from public.creator_follows cf
        where cf.creator_id = p_creator_id
          and cf.follower_id = p_user_id
          and cf.status = 'active'
      ) as is_following,
      (
        select cm.plan_id
        from public.creator_memberships cm
        where cm.creator_id = p_creator_id
          and cm.user_id = p_user_id
        limit 1
      ) as active_plan_id,
      (
        select cm.status
        from public.creator_memberships cm
        where cm.creator_id = p_creator_id
          and cm.user_id = p_user_id
        limit 1
      ) as membership_status,
      coalesce((
        select cm.cancel_at_period_end
        from public.creator_memberships cm
        where cm.creator_id = p_creator_id
          and cm.user_id = p_user_id
        limit 1
      ), false) as cancel_at_period_end,
      (
        select cm.current_period_end
        from public.creator_memberships cm
        where cm.creator_id = p_creator_id
          and cm.user_id = p_user_id
        limit 1
      ) as current_period_end,
      coalesce((
        select public.is_creator_membership_active(cm.status, cm.current_period_end, cm.grace_until)
        from public.creator_memberships cm
        where cm.creator_id = p_creator_id
          and cm.user_id = p_user_id
        limit 1
      ), false) or exists(
        select 1
        from public.subscriptions s
        where s.creator_id = p_creator_id
          and s.subscriber_id = p_user_id
          and s.status in ('active', 'trialing')
      ) as is_paid_member
  )
  select
    r.creator_id,
    r.user_id,
    r.is_following,
    r.is_paid_member,
    r.active_plan_id,
    r.membership_status,
    r.cancel_at_period_end,
    r.current_period_end,
    coalesce(cp.follower_count, 0) as follower_count,
    coalesce(cp.subscriber_count, 0) as subscriber_count,
    true as can_view_public,
    (r.is_paid_member or p_user_id = p_creator_id) as can_view_paid_members,
    r.is_paid_member as qualifies_for_member_pricing
  from relationship r
  left join public.creator_profiles cp on cp.id = p_creator_id;
$$;

alter table public.creator_follows enable row level security;
alter table public.creator_membership_plans enable row level security;
alter table public.creator_memberships enable row level security;
alter table public.creator_membership_events enable row level security;

drop policy if exists "creator_follows_select_own_or_creator" on public.creator_follows;
create policy "creator_follows_select_own_or_creator"
on public.creator_follows
for select
using (auth.uid() = follower_id or auth.uid() = creator_id);

drop policy if exists "creator_follows_insert_self" on public.creator_follows;
create policy "creator_follows_insert_self"
on public.creator_follows
for insert
with check (auth.uid() = follower_id);

drop policy if exists "creator_follows_update_self" on public.creator_follows;
create policy "creator_follows_update_self"
on public.creator_follows
for update
using (auth.uid() = follower_id)
with check (auth.uid() = follower_id);

drop policy if exists "creator_follows_delete_self" on public.creator_follows;
create policy "creator_follows_delete_self"
on public.creator_follows
for delete
using (auth.uid() = follower_id);

drop policy if exists "creator_membership_plans_select_public_active" on public.creator_membership_plans;
create policy "creator_membership_plans_select_public_active"
on public.creator_membership_plans
for select
using (is_active or auth.uid() = creator_id);

drop policy if exists "creator_membership_plans_insert_creator" on public.creator_membership_plans;
create policy "creator_membership_plans_insert_creator"
on public.creator_membership_plans
for insert
with check (auth.uid() = creator_id);

drop policy if exists "creator_membership_plans_update_creator" on public.creator_membership_plans;
create policy "creator_membership_plans_update_creator"
on public.creator_membership_plans
for update
using (auth.uid() = creator_id)
with check (auth.uid() = creator_id);

drop policy if exists "creator_membership_plans_delete_creator" on public.creator_membership_plans;
create policy "creator_membership_plans_delete_creator"
on public.creator_membership_plans
for delete
using (auth.uid() = creator_id);

drop policy if exists "creator_memberships_select_owner_or_creator" on public.creator_memberships;
create policy "creator_memberships_select_owner_or_creator"
on public.creator_memberships
for select
using (auth.uid() = user_id or auth.uid() = creator_id);

drop policy if exists "creator_membership_events_select_owner_or_creator" on public.creator_membership_events;
create policy "creator_membership_events_select_owner_or_creator"
on public.creator_membership_events
for select
using (auth.uid() = user_id or auth.uid() = creator_id);

update public.posts
set visibility = case
  when coalesce(is_premium, false) then 'paid_members'
  else 'public'
end
where visibility is null
   or visibility in ('free', 'premium', 'followers');

insert into public.creator_membership_plans (
  creator_id,
  tier_code,
  name,
  description,
  billing_period,
  interval_unit,
  interval_count,
  price,
  currency,
  is_active,
  is_default,
  display_order
)
select
  cp.id,
  'premium',
  'Premium',
  'Acesso premium ao criador',
  generated.billing_period,
  generated.interval_unit,
  generated.interval_count,
  generated.price,
  'brl',
  true,
  generated.is_default,
  generated.display_order
from public.creator_profiles cp
cross join lateral (
  values
    ('month'::text, 'month'::text, 1, round(cp.subscription_price::numeric, 2), true, 1),
    ('quarter'::text, 'month'::text, 3, round((cp.subscription_price * 3 * 0.92)::numeric, 2), false, 2),
    ('semester'::text, 'month'::text, 6, round((cp.subscription_price * 6 * 0.85)::numeric, 2), false, 3),
    ('year'::text, 'year'::text, 1, round((cp.subscription_price * 12 * 0.75)::numeric, 2), false, 4)
) as generated(billing_period, interval_unit, interval_count, price, is_default, display_order)
where cp.subscription_price > 0
  and not exists (
    select 1
    from public.creator_membership_plans plans
    where plans.creator_id = cp.id
  );

insert into public.creator_memberships (
  creator_id,
  user_id,
  plan_id,
  stripe_subscription_id,
  status,
  cancel_at_period_end,
  current_period_start,
  current_period_end,
  created_at,
  updated_at
)
select
  s.creator_id,
  s.subscriber_id,
  plans.id,
  s.stripe_subscription_id,
  case
    when s.status in ('active', 'trialing', 'past_due', 'canceled', 'expired') then s.status
    else 'active'
  end,
  false,
  coalesce(s.created_at, now())::timestamptz,
  s.current_period_end,
  coalesce(s.created_at, now())::timestamptz,
  now()
from public.subscriptions s
left join public.creator_membership_plans plans
  on plans.creator_id = s.creator_id
 and plans.billing_period = 'month'
where s.creator_id is not null
  and s.subscriber_id is not null
on conflict (creator_id, user_id) do update
set stripe_subscription_id = excluded.stripe_subscription_id,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    updated_at = now();

with creator_ids as (
  select distinct creator_id from public.creator_follows
  union
  select distinct creator_id from public.creator_memberships
)
select public.sync_creator_profile_counts(creator_id)
from creator_ids
where creator_id is not null;
