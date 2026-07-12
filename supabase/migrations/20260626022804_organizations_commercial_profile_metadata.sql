ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.metadata IS
  'Commercial profile metadata for professional operations: professionals, story, photos, awards, and sales copy.';
