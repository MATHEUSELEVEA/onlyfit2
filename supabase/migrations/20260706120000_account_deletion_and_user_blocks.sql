-- OnlyFit — App Store compliance (Pulse, DB compartilhado)
-- 1) Exclusão de conta in-app (Apple Guideline 5.1.1(v) + LGPD): hard delete + anonimização.
-- 2) Bloqueio de usuário (Apple Guideline 1.2, app com UGC): user_blocks + RPCs + filtro no feed.
--
-- Estratégia de exclusão:
--   * As 32 FKs que apontam para profiles(id) SEM ON DELETE hoje IMPEDEM apagar auth.users
--     (o cascade auth.users -> profiles bate nelas). Convertemos:
--       - conteúdo/consumo do próprio usuário  -> ON DELETE CASCADE (some junto);
--       - referências de auditoria (revisor/ator) -> ON DELETE SET NULL (linha é de outrem);
--       - threads sociais públicas (posts, comentários) -> ON DELETE SET NULL: o post/comentário
--         permanece anonimizado (sem dono) e sai naturalmente do feed (joins por creator_id).
--   Esses cascades só disparam quando o profile é apagado, o que só ocorre no delete de conta.
--   (Não usamos perfil-fantasma porque profiles.id tem FK obrigatória para auth.users.)

-- ---------------------------------------------------------------------------
-- FKs -> profiles(id): converter RESTRICT para CASCADE (dados próprios)
-- ---------------------------------------------------------------------------
ALTER TABLE public.challenge_checkins DROP CONSTRAINT IF EXISTS challenge_checkins_user_id_fkey,
  ADD CONSTRAINT challenge_checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.challenge_runs DROP CONSTRAINT IF EXISTS challenge_runs_creator_id_fkey,
  ADD CONSTRAINT challenge_runs_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.collections DROP CONSTRAINT IF EXISTS collections_creator_id_fkey,
  ADD CONSTRAINT collections_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.communities DROP CONSTRAINT IF EXISTS communities_creator_id_fkey,
  ADD CONSTRAINT communities_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_author_id_fkey,
  ADD CONSTRAINT community_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.crm_alerts DROP CONSTRAINT IF EXISTS crm_alerts_coach_id_fkey,
  ADD CONSTRAINT crm_alerts_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.crm_alerts DROP CONSTRAINT IF EXISTS crm_alerts_student_id_fkey,
  ADD CONSTRAINT crm_alerts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.diet_plans DROP CONSTRAINT IF EXISTS diet_plans_created_by_fkey,
  ADD CONSTRAINT diet_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.entitlements DROP CONSTRAINT IF EXISTS entitlements_pro_id_fkey,
  ADD CONSTRAINT entitlements_pro_id_fkey FOREIGN KEY (pro_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.lives DROP CONSTRAINT IF EXISTS lives_creator_id_fkey,
  ADD CONSTRAINT lives_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey,
  ADD CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
  ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.pin_events DROP CONSTRAINT IF EXISTS pin_events_user_id_fkey,
  ADD CONSTRAINT pin_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.post_likes DROP CONSTRAINT IF EXISTS post_likes_user_id_fkey,
  ADD CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.pro_subscriptions DROP CONSTRAINT IF EXISTS pro_subscriptions_pro_id_fkey,
  ADD CONSTRAINT pro_subscriptions_pro_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.product_purchases DROP CONSTRAINT IF EXISTS product_purchases_buyer_id_fkey,
  ADD CONSTRAINT product_purchases_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_creator_id_fkey,
  ADD CONSTRAINT products_creator_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.student_supplement_plans DROP CONSTRAINT IF EXISTS student_supplement_plans_created_by_fkey,
  ADD CONSTRAINT student_supplement_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.student_workout_assignments DROP CONSTRAINT IF EXISTS student_workout_assignments_student_user_id_fkey,
  ADD CONSTRAINT student_workout_assignments_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_creator_id_fkey,
  ADD CONSTRAINT subscriptions_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_subscriber_id_fkey,
  ADD CONSTRAINT subscriptions_subscriber_id_fkey FOREIGN KEY (subscriber_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_achievements DROP CONSTRAINT IF EXISTS user_achievements_user_id_fkey,
  ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_checkins DROP CONSTRAINT IF EXISTS user_checkins_user_id_fkey,
  ADD CONSTRAINT user_checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.video_views DROP CONSTRAINT IF EXISTS video_views_user_id_fkey,
  ADD CONSTRAINT video_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.workout_cycles DROP CONSTRAINT IF EXISTS workout_cycles_student_id_fkey,
  ADD CONSTRAINT workout_cycles_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.workout_protocols DROP CONSTRAINT IF EXISTS workout_protocols_pro_id_fkey,
  ADD CONSTRAINT workout_protocols_pro_id_fkey FOREIGN KEY (pro_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.workouts DROP CONSTRAINT IF EXISTS workouts_owner_id_fkey,
  ADD CONSTRAINT workouts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Referências de auditoria/ator (a linha pertence a outra pessoa) -> SET NULL
ALTER TABLE public.anamnesis_submissions DROP CONSTRAINT IF EXISTS anamnesis_submissions_reviewed_by_fkey,
  ADD CONSTRAINT anamnesis_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_actor_id_fkey,
  ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.student_reports DROP CONSTRAINT IF EXISTS student_reports_generated_by_fkey,
  ADD CONSTRAINT student_reports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Threads sociais públicas: anonimizadas (sem dono) ao apagar a conta.
ALTER TABLE public.posts ALTER COLUMN creator_id DROP NOT NULL;
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_creator_id_fkey,
  ADD CONSTRAINT posts_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.post_comments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.post_comments DROP CONSTRAINT IF EXISTS post_comments_user_id_fkey,
  ADD CONSTRAINT post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- delete_own_account(): apaga a própria conta (chamada pela edge function via service_role,
-- mas também segura para o próprio usuário — valida auth.uid()).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_own_account(p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Só permite apagar a própria conta quando chamada com JWT de usuário.
  -- (service_role tem auth.uid() NULL e passa p_user_id explicitamente.)
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_uid THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Apaga o profile: dispara CASCADE (dados próprios), SET NULL (auditoria) e
  -- SET NULL em posts/post_comments (anonimização das threads públicas),
  -- além dos cascades já existentes (creator_profiles, follows, tokens, etc.).
  DELETE FROM public.profiles WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_account(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- user_blocks: bloqueio entre usuários (Apple 1.2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);

COMMENT ON TABLE public.user_blocks IS 'Bloqueio de usuários (feed/comentários/DM ocultos nos dois sentidos). RLS: cada um só lê/escreve os próprios bloqueios.';

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_blocks_select_own ON public.user_blocks;
CREATE POLICY user_blocks_select_own ON public.user_blocks
  FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_blocks_insert_own ON public.user_blocks;
CREATE POLICY user_blocks_insert_own ON public.user_blocks
  FOR INSERT TO authenticated
  WITH CHECK (blocker_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_blocks_delete_own ON public.user_blocks;
CREATE POLICY user_blocks_delete_own ON public.user_blocks
  FOR DELETE TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

-- block_user: cria o bloqueio e desfaz follows mútuos (dois sentidos).
CREATE OR REPLACE FUNCTION public.block_user(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_target IS NULL OR p_target = v_uid THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target) THEN
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (v_uid, p_target)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

  -- Desfaz follows nos dois sentidos para não vazar conteúdo/notificações.
  DELETE FROM public.creator_follows
  WHERE (follower_id = v_uid AND creator_id = p_target)
     OR (follower_id = p_target AND creator_id = v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unblock_user(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  DELETE FROM public.user_blocks WHERE blocker_id = v_uid AND blocked_id = p_target;
END;
$$;

REVOKE ALL ON FUNCTION public.unblock_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- feed_home_posts_page: exclui posts de quem eu bloqueei OU quem me bloqueou.
-- (Redefinição idêntica à 20260618041457 + filtro NOT EXISTS user_blocks.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.feed_home_posts_page(p_limit integer, p_offset integer, p_sports text[] DEFAULT NULL)
 RETURNS TABLE(post_id uuid)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() AS uid),
  flt AS (SELECT (p_sports IS NOT NULL AND cardinality(p_sports) > 0) AS active),
  followed_creators AS (
    SELECT cf.creator_id
    FROM creator_follows cf, me
    WHERE cf.follower_id = me.uid AND cf.status = 'active'
  ),
  prefs AS (
    SELECT cp.category AS category, SUM(eng.w)::numeric AS weight
    FROM (
      SELECT cf.creator_id, 1.0::numeric AS w
        FROM creator_follows cf, me
        WHERE cf.follower_id = me.uid AND cf.status = 'active'
      UNION ALL
      SELECT p.creator_id, 1.5::numeric
        FROM post_likes pl JOIN posts p ON p.id = pl.post_id, me
        WHERE pl.user_id = me.uid
      UNION ALL
      SELECT p.creator_id, (0.5 + COALESCE(vv.percentage_watched, 0) / 100.0)::numeric
        FROM video_views vv JOIN posts p ON p.id = vv.post_id, me
        WHERE vv.user_id = me.uid
    ) eng
    JOIN creator_profiles cp ON cp.id = eng.creator_id
    WHERE cp.category IS NOT NULL AND cp.category <> ''
    GROUP BY cp.category
  ),
  followed AS (
    SELECT p.id AS post_id, p.published_at,
           ROW_NUMBER() OVER (ORDER BY p.published_at DESC NULLS LAST, p.id DESC) AS rn
    FROM public.posts p
    LEFT JOIN creator_profiles cpf ON cpf.id = p.creator_id, me, flt
    WHERE (p.creator_id = me.uid
       OR EXISTS (SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id))
      AND (NOT flt.active
        OR p.sports && p_sports
        OR (cardinality(COALESCE(p.sports, '{}')) = 0 AND cpf.sports && p_sports))
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks ub
        WHERE (ub.blocker_id = me.uid AND ub.blocked_id = p.creator_id)
           OR (ub.blocker_id = p.creator_id AND ub.blocked_id = me.uid))
  ),
  recommended AS (
    SELECT p.id AS post_id, p.published_at,
           ROW_NUMBER() OVER (
             ORDER BY (
               COALESCE(pr.weight, 0)
               + LN(1 + COALESCE(p.likes, 0))
               - EXTRACT(EPOCH FROM (now() - COALESCE(p.published_at, now()))) / (60*60*24*30)
             ) DESC, p.published_at DESC NULLS LAST, p.id DESC
           ) AS rn
    FROM public.posts p
    JOIN profiles pf ON pf.id = p.creator_id AND pf.is_creator = true
    JOIN creator_profiles cp ON cp.id = p.creator_id
    JOIN prefs pr ON pr.category = cp.category, me, flt
    WHERE COALESCE(p.visibility, 'public') = 'public'
      AND p.creator_id <> me.uid
      AND NOT EXISTS (SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id)
      AND (NOT flt.active
        OR p.sports && p_sports
        OR (cardinality(COALESCE(p.sports, '{}')) = 0 AND cp.sports && p_sports))
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks ub
        WHERE (ub.blocker_id = me.uid AND ub.blocked_id = p.creator_id)
           OR (ub.blocker_id = p.creator_id AND ub.blocked_id = me.uid))
  ),
  combined AS (
    SELECT post_id, (rn + (rn - 1) / 5) AS slot, published_at, 0 AS src FROM followed
    UNION ALL
    SELECT post_id, (rn * 6) AS slot, published_at, 1 AS src FROM recommended
  )
  SELECT post_id
  FROM combined
  ORDER BY slot, src, published_at DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$function$;

REVOKE EXECUTE ON FUNCTION public.feed_home_posts_page(integer, integer, text[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.feed_home_posts_page(integer, integer, text[]) TO authenticated;
