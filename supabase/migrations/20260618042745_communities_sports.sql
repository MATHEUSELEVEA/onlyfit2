-- MVP 3 — Comunidades por nicho: comunidades navegáveis por esporte.
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS sports text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS communities_sports_gin_idx
  ON public.communities USING gin (sports);
