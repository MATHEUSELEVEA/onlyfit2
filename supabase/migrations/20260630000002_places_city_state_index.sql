-- ============================================================
-- Add composite index on places (city, state) for efficient
-- location-based queries used by SportsPresenceWizard.
-- hm-performance: queries filtram por city + state simultaneamente
-- ============================================================

create index if not exists idx_places_city_state
  on public.places (lower(city), lower(state));

-- Remove less-useful single-column index now covered by composite
-- Keep for backward compat; Postgres can still use it.
