alter table public.pulse_flow_coach_override
  add column if not exists is_active boolean not null default true;

comment on column public.pulse_flow_coach_override.is_active is
  'Whether this trigger is enabled for this coach or organization scope. Inactive rows keep saved message settings but block outbound rendering.';

create index if not exists pulse_flow_coach_override_org_active_idx
  on public.pulse_flow_coach_override (organization_id, is_active)
  where organization_id is not null;

create index if not exists pulse_flow_coach_override_coach_active_idx
  on public.pulse_flow_coach_override (coach_id, is_active)
  where organization_id is null;
