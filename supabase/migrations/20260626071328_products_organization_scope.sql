-- Scope Market products to a business/organization when they are created from
-- a management ERP. The column is nullable to preserve legacy profile-owned
-- products and avoid guessing for users that already own multiple businesses.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_organization_idx
  ON public.products (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_organization_published_idx
  ON public.products (organization_id, is_published, active)
  WHERE organization_id IS NOT NULL;

WITH single_owner_org AS (
  SELECT owner_id, (array_agg(id ORDER BY created_at ASC, id::text ASC))[1] AS organization_id
  FROM public.organizations
  GROUP BY owner_id
  HAVING count(*) = 1
)
UPDATE public.products p
SET organization_id = soo.organization_id
FROM single_owner_org soo
WHERE p.organization_id IS NULL
  AND p.tenant_id = soo.owner_id;

DO $$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    DROP POLICY IF EXISTS products_organization_staff_select ON public.products;
    DROP POLICY IF EXISTS products_organization_staff_insert ON public.products;
    DROP POLICY IF EXISTS products_organization_staff_update ON public.products;
    DROP POLICY IF EXISTS products_organization_staff_delete ON public.products;

    CREATE POLICY products_organization_staff_select
      ON public.products
      FOR SELECT
      USING (
        organization_id IS NULL
        OR private.is_organization_staff(organization_id, (select auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.organizations o
          WHERE o.id = organization_id
            AND o.status = 'published'
        )
      );

    CREATE POLICY products_organization_staff_insert
      ON public.products
      FOR INSERT
      WITH CHECK (
        organization_id IS NULL
        OR private.is_organization_staff(organization_id, (select auth.uid()))
      );

    CREATE POLICY products_organization_staff_update
      ON public.products
      FOR UPDATE
      USING (
        organization_id IS NULL
        OR private.is_organization_staff(organization_id, (select auth.uid()))
      )
      WITH CHECK (
        organization_id IS NULL
        OR private.is_organization_staff(organization_id, (select auth.uid()))
      );

    CREATE POLICY products_organization_staff_delete
      ON public.products
      FOR DELETE
      USING (
        organization_id IS NULL
        OR private.is_organization_staff(organization_id, (select auth.uid()))
      );
  END IF;
END $$;
