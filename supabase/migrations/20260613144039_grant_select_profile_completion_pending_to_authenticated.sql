-- Hotfix de produção: o role `authenticated` precisa de SELECT em
-- profiles.profile_completion_pending.
--
-- A migration 20260426224024 pretendia conceder esta coluna, mas o grant não
-- estava efetivo em produção. Sem ele, qualquer SELECT do AuthContext que inclua
-- a coluna falha com "permission denied for table profiles", derrubando o fetch
-- de perfil em TODAS as rotas autenticadas (tela "Servidor instável").
--
-- Coluna booleana não-sensível (flag de complemento de cadastro de importados).
-- Grant aditivo, idempotente.

GRANT SELECT (profile_completion_pending) ON public.profiles TO authenticated;

-- Recarrega o schema cache do PostgREST.
NOTIFY pgrst, 'reload schema';
