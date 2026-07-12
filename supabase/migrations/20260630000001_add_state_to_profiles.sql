-- ============================================================
-- Migration: add_state_to_profiles
-- Segura: ADD COLUMN IF NOT EXISTS, nullable, zero risco
-- Reversivel: ALTER TABLE profiles DROP COLUMN IF EXISTS state;
-- ============================================================

-- 1. Coluna state, nullable
alter table public.profiles
  add column if not exists state text;

-- 2. Marcar city como deprecated
comment on column public.profiles.city is 'DEPRECATED: use normalized brazilian_cities reference';

-- 3. Nao mexer em organizations nem places — colunas aceitam texto livre
-- CityStatePicker vai popular com dados normalizados
