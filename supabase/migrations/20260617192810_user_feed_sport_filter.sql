-- Persistência por usuário do filtro de esporte do feed.
-- Coluna dedicada (não reaproveita user_preferences.sports, que tem semântica de
-- onboarding "esportes que pratica"). RLS da tabela user_preferences já cobre a linha
-- do próprio usuário — apenas adicionamos uma coluna.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS feed_sport_filter text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.user_preferences.feed_sport_filter IS
  'Filtro de esporte persistente do feed (multi-seleção). Vazio = Tudo.';
