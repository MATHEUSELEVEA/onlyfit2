alter table public.pulse_flow_coach_override
  alter column is_active set default false;

comment on column public.pulse_flow_coach_override.is_active is
  'Whether this trigger is explicitly enabled for this coach or organization scope. Missing rows and false rows must be treated as inactive.';
