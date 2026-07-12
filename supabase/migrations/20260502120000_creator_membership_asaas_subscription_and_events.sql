-- Após creator_memberships / creator_membership_events (20260502000000).
-- Pulse: vínculo com assinatura recorrente Asaas (cartão) vs cobrança avulsa (PIX).

alter table public.subscriptions
  add column if not exists asaas_subscription_id text null;

alter table public.creator_memberships
  add column if not exists asaas_subscription_id text null;

comment on column public.subscriptions.asaas_subscription_id is 'ID da assinatura no Asaas (sub_xxx) quando checkout é recorrente com cartão.';
comment on column public.creator_memberships.asaas_subscription_id is 'ID da assinatura no Asaas (sub_xxx) para renovações e correlação no webhook.';

create unique index if not exists subscriptions_asaas_subscription_id_key
  on public.subscriptions (asaas_subscription_id)
  where asaas_subscription_id is not null;

create unique index if not exists creator_memberships_asaas_subscription_id_key
  on public.creator_memberships (asaas_subscription_id)
  where asaas_subscription_id is not null;

-- Webhook usa payment_confirmed (dedup idx) e renewal_succeeded; alinhar CHECK.
alter table public.creator_membership_events
  drop constraint if exists creator_membership_events_event_type_check;

alter table public.creator_membership_events
  add constraint creator_membership_events_event_type_check check (
    event_type in (
      'follow_created',
      'follow_removed',
      'checkout_started',
      'checkout_completed',
      'subscription_activated',
      'payment_confirmed',
      'renewal_succeeded',
      'renewal_failed',
      'cancel_scheduled',
      'canceled',
      'reactivated',
      'billing_period_changed'
    )
  );
