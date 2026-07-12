-- Exposed schema security cleanup from Supabase advisors.

CREATE SCHEMA IF NOT EXISTS extensions;

-- Keep extension functions/types resolvable for SQL functions and API roles after moving
-- extension namespaces out of public.
DO $$
BEGIN
  EXECUTE format(
    'ALTER DATABASE %I SET search_path = public, extensions, net, auth, storage, pg_temp',
    current_database()
  );
END $$;

ALTER ROLE anon SET search_path = public, extensions, net, auth, storage, pg_temp;
ALTER ROLE authenticated SET search_path = public, extensions, net, auth, storage, pg_temp;
ALTER ROLE service_role SET search_path = public, extensions, net, auth, storage, pg_temp;

ALTER EXTENSION vector SET SCHEMA extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
ALTER EXTENSION unaccent SET SCHEMA extensions;

-- Exposed app-owned tables without RLS fail closed.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('wedding', 'vendor_portfolio'),
      ('clinical', 'agent_configs'),
      ('clinical', 'agent_conversations'),
      ('clinical', 'agent_messages'),
      ('clinical', 'agent_actions'),
      ('claude_agentics', 'brand_visual_history'),
      ('claude_agentics', 'distributed_rate_limits')
    ) AS t(schema_name, table_name)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schema_name, r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS deny_all_client_access ON %I.%I', r.schema_name, r.table_name);
    EXECUTE format(
      'CREATE POLICY deny_all_client_access ON %I.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      r.schema_name,
      r.table_name
    );
  END LOOP;
END $$;

-- Materialized control data should be accessed through guarded RPCs, not direct API reads.
REVOKE ALL ON TABLE public.mv_control_creator_cohort_matrix FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mv_control_creator_cohort_matrix TO service_role;
