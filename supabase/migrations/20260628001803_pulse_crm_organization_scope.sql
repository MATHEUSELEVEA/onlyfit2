-- Scope CRM message overrides by commercial profile/organization.
-- Legacy coach-scoped rows are preserved for standalone /coach/crm usage.

ALTER TABLE public.pulse_flow_coach_override
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.pulse_flow_coach_override
  ALTER COLUMN coach_id DROP NOT NULL;

ALTER TABLE public.pulse_flow_coach_override
  DROP CONSTRAINT IF EXISTS pulse_flow_coach_override_scope_chk;

ALTER TABLE public.pulse_flow_coach_override
  ADD CONSTRAINT pulse_flow_coach_override_scope_chk
  CHECK (coach_id IS NOT NULL OR organization_id IS NOT NULL);

ALTER TABLE public.pulse_flow_coach_override
  DROP CONSTRAINT IF EXISTS pulse_flow_coach_override_organization_trigger_key;

ALTER TABLE public.pulse_flow_coach_override
  ADD CONSTRAINT pulse_flow_coach_override_organization_trigger_key
  UNIQUE (organization_id, trigger_type);

CREATE INDEX IF NOT EXISTS idx_pulse_flow_coach_override_organization
  ON public.pulse_flow_coach_override (organization_id)
  WHERE organization_id IS NOT NULL;

DROP POLICY IF EXISTS pulse_flow_coach_override_all_own ON public.pulse_flow_coach_override;
DROP POLICY IF EXISTS pulse_flow_coach_override_all_scope ON public.pulse_flow_coach_override;

CREATE POLICY pulse_flow_coach_override_all_scope
  ON public.pulse_flow_coach_override FOR ALL
  TO authenticated
  USING (
    (coach_id IS NOT NULL AND coach_id = (select auth.uid()))
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_staff(organization_id, (select auth.uid()))
    )
  )
  WITH CHECK (
    (coach_id IS NOT NULL AND coach_id = (select auth.uid()))
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_staff(organization_id, (select auth.uid()))
    )
  );

COMMENT ON COLUMN public.pulse_flow_coach_override.organization_id IS
  'Commercial profile/organization scope for CRM message overrides. Preferred over legacy coach_id when available.';
