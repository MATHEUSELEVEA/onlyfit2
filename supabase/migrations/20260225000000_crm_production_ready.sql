-- =============================================================================
-- CRM PRODUCTION-READY: Mega-migration
-- Triggers, Functions, Crons, Tables, Views, Backfill, Seeds
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. AUTO-CREATE crm_student_snapshots on new coach_relationships
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_create_crm_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('active', 'pending_payment') THEN
    INSERT INTO crm_student_snapshots (student_id, coach_id, churn_risk_score, is_safe_to_nudge)
    VALUES (NEW.student_id, NEW.coach_id, 100, true)
    ON CONFLICT (student_id, coach_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_crm_snapshot ON coach_relationships;
CREATE TRIGGER trg_auto_crm_snapshot
  AFTER INSERT ON coach_relationships
  FOR EACH ROW EXECUTE FUNCTION fn_auto_create_crm_snapshot();

-- Also fire on UPDATE (e.g. status changed to active)
DROP TRIGGER IF EXISTS trg_auto_crm_snapshot_update ON coach_relationships;
CREATE TRIGGER trg_auto_crm_snapshot_update
  AFTER UPDATE OF status ON coach_relationships
  FOR EACH ROW
  WHEN (NEW.status IN ('active', 'pending_payment') AND OLD.status <> NEW.status)
  EXECUTE FUNCTION fn_auto_create_crm_snapshot();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. UPDATE last_workout_at on workout_logs INSERT (replace existing trigger)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_crm_process_workout_log()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE crm_student_snapshots
  SET
    last_workout_at = NOW(),
    churn_risk_score = LEAST(100, churn_risk_score + 5),
    last_interaction_at = NOW()
  WHERE student_id = NEW.student_id
    AND coach_id IN (
      SELECT coach_id FROM coach_relationships
      WHERE student_id = NEW.student_id AND status = 'active'
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_crm_process_workout_log ON workout_logs;
CREATE TRIGGER tr_crm_process_workout_log
  AFTER INSERT ON workout_logs
  FOR EACH ROW EXECUTE FUNCTION fn_crm_process_workout_log();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. UPGRADE pulse_shadow_scan_inactivity() — 2 levels: 3 days and 7 days
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_shadow_scan_inactivity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Level 1: 3 days inactive
  INSERT INTO pulse_action_outbox (student_id, coach_id, channel, trigger_type, context_data)
  SELECT
    s.student_id, s.coach_id, 'WHATSAPP', 'INACTIVITY_3_DAYS',
    jsonb_build_object('days_inactive', EXTRACT(DAY FROM (NOW() - s.last_workout_at))::INT)
  FROM crm_student_snapshots s
  WHERE s.is_safe_to_nudge = true
    AND s.last_workout_at < NOW() - INTERVAL '3 days'
    AND s.last_workout_at >= NOW() - INTERVAL '7 days'
    AND (s.last_nudge_sent_at IS NULL OR s.last_nudge_sent_at < NOW() - INTERVAL '24 hours')
    AND NOT EXISTS (
      SELECT 1 FROM pulse_action_outbox pao
      WHERE pao.student_id = s.student_id AND pao.coach_id = s.coach_id
        AND pao.trigger_type = 'INACTIVITY_3_DAYS'
        AND pao.created_at > NOW() - INTERVAL '3 days'
    );

  -- Level 2: 7 days inactive (critical)
  INSERT INTO pulse_action_outbox (student_id, coach_id, channel, trigger_type, context_data)
  SELECT
    s.student_id, s.coach_id, 'WHATSAPP', 'INACTIVITY_7_DAYS',
    jsonb_build_object('days_inactive', EXTRACT(DAY FROM (NOW() - s.last_workout_at))::INT)
  FROM crm_student_snapshots s
  WHERE s.is_safe_to_nudge = true
    AND s.last_workout_at < NOW() - INTERVAL '7 days'
    AND (s.last_nudge_sent_at IS NULL OR s.last_nudge_sent_at < NOW() - INTERVAL '48 hours')
    AND NOT EXISTS (
      SELECT 1 FROM pulse_action_outbox pao
      WHERE pao.student_id = s.student_id AND pao.coach_id = s.coach_id
        AND pao.trigger_type = 'INACTIVITY_7_DAYS'
        AND pao.created_at > NOW() - INTERVAL '7 days'
    );

  -- Decay churn risk for all inactive students
  UPDATE crm_student_snapshots
  SET churn_risk_score = GREATEST(0, churn_risk_score - 10)
  WHERE last_workout_at < NOW() - INTERVAL '3 days';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FLOW EXECUTION LOG TABLE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.flow_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES pro_ai_flows(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_data JSONB DEFAULT '{}',
  result TEXT NOT NULL DEFAULT 'success',
  outbox_id UUID REFERENCES pulse_action_outbox(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_exec_flow ON flow_execution_log(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_exec_coach ON flow_execution_log(coach_id);
CREATE INDEX IF NOT EXISTS idx_flow_exec_date ON flow_execution_log(executed_at);

ALTER TABLE flow_execution_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches see own executions" ON flow_execution_log;
CREATE POLICY "Coaches see own executions" ON flow_execution_log
  FOR SELECT USING (auth.uid() = coach_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. EXTEND pro_ai_flows WITH EXTRA COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE pro_ai_flows
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'WHATSAPP',
  ADD COLUMN IF NOT EXISTS delay_days INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_prompt_template TEXT,
  ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_system_template BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'retention';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. SEED DEFAULT FLOW TEMPLATES (system templates)
-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotent: use existing profile (pulse-system or any); skip if no profiles (profiles.id FK to auth.users).
DO $$
DECLARE
  v_sys UUID;
BEGIN
  -- Use system profile if it exists (must exist in auth.users); otherwise any existing profile so seed can run
  SELECT id INTO v_sys FROM profiles WHERE username = 'pulse-system' LIMIT 1;
  IF v_sys IS NULL THEN
    SELECT id INTO v_sys FROM profiles ORDER BY id LIMIT 1;
  END IF;
  IF v_sys IS NULL THEN
    RETURN; -- no profiles yet, skip seed
  END IF;

  INSERT INTO pro_ai_flows (creator_id, title, description, trigger_type, delay_expression, delay_days, action_type, channel, is_active, icon_name, is_system_template, category, ai_prompt_template)
  VALUES
  (v_sys, 'Boas-vindas ao Novo Aluno', 'Envia mensagem de boas-vindas personalizada quando um novo aluno é adicionado.', 'NEW_STUDENT', 'Imediato', 0, 'WHATSAPP_MESSAGE', 'WHATSAPP', true, 'UserPlus', true, 'onboarding',
   'Você é um personal trainer acolhedor. Dê boas-vindas ao aluno {{student_name}} que acabou de começar. Seja motivador e curto (máx 3 frases).'),

  (v_sys, 'Check-in de Adaptação', 'Pergunta ao aluno sobre adaptação 7 dias após receber um novo protocolo de treino.', 'PROTOCOL_ASSIGNED', '7 dias depois', 7, 'WHATSAPP_MESSAGE', 'WHATSAPP', true, 'Dumbbell', true, 'retention',
   'Envie uma mensagem amigável perguntando ao aluno {{student_name}} como está se adaptando ao novo treino "{{protocol_name}}". Pergunte se está sentindo dores ou dificuldades.'),

  (v_sys, 'Alerta de Inatividade (3 dias)', 'Nudge motivacional quando aluno não treina há 3 dias.', 'INACTIVITY_3_DAYS', 'Imediato', 0, 'WHATSAPP_MESSAGE', 'WHATSAPP', true, 'TrendingDown', true, 'churn',
   'O aluno {{student_name}} está há {{days_inactive}} dias sem treinar. Envie uma mensagem motivacional e leve, sem pressão. Pergunte se está tudo bem.'),

  (v_sys, 'Alerta de Inatividade Crítica (7 dias)', 'Alerta urgente quando aluno está 7+ dias sem treinar.', 'INACTIVITY_7_DAYS', 'Imediato', 0, 'WHATSAPP_MESSAGE', 'WHATSAPP', true, 'AlertTriangle', true, 'churn',
   'O aluno {{student_name}} está há {{days_inactive}} dias sem treinar. Envie uma mensagem mais séria e preocupada. Ofereça ajuda para reprogramar o treino.'),

  (v_sys, 'Protocolo Expirando (5 dias)', 'Notifica o coach quando o protocolo de um aluno está prestes a expirar.', 'PROTOCOL_EXPIRING', 'Imediato', 0, 'SYSTEM_ALERT', 'SYSTEM', true, 'Clock', true, 'lifecycle',
   'O protocolo "{{protocol_name}}" do aluno {{student_name}} expira em {{days_remaining}} dias. Sugira renovação ou atualização.'),

  (v_sys, 'Protocolo Expirado', 'Alerta quando o protocolo do aluno expirou e precisa ser renovado.', 'PROTOCOL_EXPIRED', 'Imediato', 0, 'WHATSAPP_MESSAGE', 'WHATSAPP', true, 'CalendarX', true, 'lifecycle',
   'O protocolo do aluno {{student_name}} expirou. Envie uma mensagem informando que o treino será atualizado em breve.'),

  (v_sys, 'Parabéns Sequência 10 Treinos', 'Celebração quando aluno completa 10 treinos.', 'STREAK_10', 'Imediato', 0, 'WHATSAPP_MESSAGE', 'WHATSAPP', true, 'Zap', true, 'gamification',
   'O aluno {{student_name}} completou {{streak_count}} treinos! Parabenize com entusiasmo. Mencione o progresso.'),

  (v_sys, 'Parabéns Sequência 30 Treinos', 'Celebração especial por 30 treinos completados.', 'STREAK_30', 'Imediato', 0, 'WHATSAPP_MESSAGE', 'WHATSAPP', true, 'Trophy', true, 'gamification',
   'O aluno {{student_name}} completou incríveis {{streak_count}} treinos! Faça uma celebração especial. Este é um marco notável.'),

  (v_sys, 'Recuperação de Pagamento (Nível 1)', 'Lembrete amigável após falha de pagamento.', 'PAYMENT_FAILED', '1 dia', 1, 'WHATSAPP_MESSAGE', 'WHATSAPP', true, 'DollarSign', true, 'billing',
   'O pagamento do aluno {{student_name}} falhou. Envie um lembrete amigável e discreto sobre o pagamento pendente. Sem constrangimento.'),

  (v_sys, 'Recuperação de Pagamento (Nível 2)', 'Aviso formal após 3 dias de pagamento pendente.', 'PAYMENT_WARNING_3_DAYS', 'Imediato', 0, 'WHATSAPP_MESSAGE', 'WHATSAPP', true, 'AlertCircle', true, 'billing',
   'O pagamento do aluno {{student_name}} está pendente há 3 dias. Envie um aviso mais formal, mencionando que o acesso pode ser restringido.'),

  (v_sys, 'Aniversário do Aluno', 'Mensagem de parabéns no aniversário.', 'BIRTHDAY', 'Imediato', 0, 'WHATSAPP_MESSAGE', 'WHATSAPP', false, 'Cake', true, 'relationship',
   'Hoje é o aniversário do aluno {{student_name}}! Envie uma mensagem calorosa de parabéns. Deseje saúde e bons treinos.'),

  (v_sys, 'Resumo Mensal', 'Relatório mensal de progresso enviado ao coach.', 'MONTHLY_REPORT', 'Imediato', 0, 'SYSTEM_ALERT', 'SYSTEM', true, 'BarChart', true, 'analytics',
   'Gere um resumo mensal para o coach sobre o progresso dos alunos.')

  ON CONFLICT DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. FUNCTION: Seed default flows for a specific coach
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_seed_default_flows_for_coach(p_coach_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO pro_ai_flows (
    creator_id, title, description, trigger_type, delay_expression,
    delay_days, action_type, channel, is_active, icon_name,
    is_system_template, category, ai_prompt_template
  )
  SELECT
    p_coach_id, title, description, trigger_type, delay_expression,
    delay_days, action_type, channel, is_active, icon_name,
    false, category, ai_prompt_template
  FROM pro_ai_flows
  WHERE is_system_template = true
  AND NOT EXISTS (
    SELECT 1 FROM pro_ai_flows pf
    WHERE pf.creator_id = p_coach_id AND pf.trigger_type = pro_ai_flows.trigger_type
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ENGAGEMENT SCORE RECALCULATION (cron every 6h)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_recalculate_engagement()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles p
  SET engagement_score = sub.score
  FROM (
    SELECT
      cr.student_id,
      LEAST(1.0,
        COALESCE(
          (
            SELECT COUNT(DISTINCT DATE(wl.logged_at))::FLOAT / 14.0
            FROM workout_logs wl
            WHERE wl.student_id = cr.student_id
              AND wl.logged_at >= NOW() - INTERVAL '14 days'
          ), 0
        )
      ) AS score
    FROM coach_relationships cr
    WHERE cr.status = 'active'
    GROUP BY cr.student_id
  ) sub
  WHERE p.id = sub.student_id;
END;
$$;

SELECT cron.schedule('pulse_engagement_recalc', '0 */6 * * *',
  $$ SELECT pulse_recalculate_engagement(); $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. PROTOCOL EXPIRY SCANNER (cron daily 08h)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_scan_protocol_expiry()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Protocols expiring within 5 days
  INSERT INTO pulse_action_outbox (student_id, coach_id, channel, trigger_type, context_data)
  SELECT
    wc.student_id,
    wc.coach_id,
    'SYSTEM',
    'PROTOCOL_EXPIRING',
    jsonb_build_object(
      'protocol_name', wc.name,
      'ends_at', (wc.starts_at + (wc.duration_weeks * 7))::TEXT,
      'days_remaining', ((wc.starts_at + (wc.duration_weeks * 7)) - CURRENT_DATE)
    )
  FROM workout_cycles wc
  WHERE wc.status = 'active'
    AND wc.duration_weeks IS NOT NULL
    AND wc.starts_at IS NOT NULL
    AND (wc.starts_at + (wc.duration_weeks * 7)) BETWEEN CURRENT_DATE AND CURRENT_DATE + 5
    AND NOT EXISTS (
      SELECT 1 FROM pulse_action_outbox pao
      WHERE pao.student_id = wc.student_id
        AND pao.trigger_type = 'PROTOCOL_EXPIRING'
        AND pao.created_at > NOW() - INTERVAL '5 days'
    );

  -- Already expired protocols
  INSERT INTO pulse_action_outbox (student_id, coach_id, channel, trigger_type, context_data)
  SELECT
    wc.student_id,
    wc.coach_id,
    'SYSTEM',
    'PROTOCOL_EXPIRED',
    jsonb_build_object(
      'protocol_name', wc.name,
      'expired_at', (wc.starts_at + (wc.duration_weeks * 7))::TEXT
    )
  FROM workout_cycles wc
  WHERE wc.status = 'active'
    AND wc.duration_weeks IS NOT NULL
    AND wc.starts_at IS NOT NULL
    AND (wc.starts_at + (wc.duration_weeks * 7)) < CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM pulse_action_outbox pao
      WHERE pao.student_id = wc.student_id
        AND pao.trigger_type = 'PROTOCOL_EXPIRED'
        AND pao.created_at > NOW() - INTERVAL '7 days'
    );
END;
$$;

SELECT cron.schedule('pulse_protocol_expiry_scan', '0 8 * * *',
  $$ SELECT pulse_scan_protocol_expiry(); $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. STREAK SCANNER (cron daily 10h)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_scan_workout_streaks()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO pulse_action_outbox (student_id, coach_id, channel, trigger_type, context_data)
  SELECT
    cr.student_id,
    cr.coach_id,
    'WHATSAPP',
    CASE WHEN streak_count >= 30 THEN 'STREAK_30' ELSE 'STREAK_10' END,
    jsonb_build_object('streak_count', streak_count)
  FROM (
    SELECT
      wl.student_id,
      COUNT(DISTINCT DATE(wl.logged_at)) AS streak_count
    FROM workout_logs wl
    WHERE wl.logged_at >= NOW() - INTERVAL '45 days'
    GROUP BY wl.student_id
    HAVING COUNT(DISTINCT DATE(wl.logged_at)) >= 10
  ) streaks
  JOIN coach_relationships cr ON cr.student_id = streaks.student_id AND cr.status = 'active'
  WHERE NOT EXISTS (
    SELECT 1 FROM pulse_action_outbox pao
    WHERE pao.student_id = streaks.student_id
      AND pao.trigger_type IN ('STREAK_10', 'STREAK_30')
      AND pao.created_at > NOW() - INTERVAL '30 days'
  );
END;
$$;

SELECT cron.schedule('pulse_streak_scan', '0 10 * * *',
  $$ SELECT pulse_scan_workout_streaks(); $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. ENRICHED CRM VIEW v2
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS view_coach_students_crm;
CREATE VIEW view_coach_students_crm AS
SELECT
  cr.coach_id,
  cr.student_id,
  cr.status AS relationship_status,
  p.full_name,
  p.avatar_url,
  p.engagement_score,
  CASE
    WHEN p.engagement_score >= 0.8 THEN 'green'
    WHEN p.engagement_score >= 0.4 THEN 'yellow'
    ELSE 'red'
  END AS health_status,
  cr.starts_at,
  cr.notes,
  cr.consultoria_price,
  cr.checkout_url,
  cr.billing_interval,
  cr.billing_mode,
  cr.billing_source,
  CASE
    WHEN cr.status = 'pending_payment' THEN 'pending'
    WHEN p.app_lockdown = true THEN 'overdue'
    WHEN cr.consultoria_price IS NOT NULL AND cr.consultoria_price > 0 THEN 'active'
    ELSE NULL
  END AS billing_status,
  -- CRM Enrichment from snapshots
  cs.last_workout_at,
  cs.churn_risk_score,
  cs.last_nudge_sent_at,
  cs.active_injuries,
  CASE
    WHEN cs.last_workout_at IS NULL THEN NULL
    ELSE GREATEST(0, EXTRACT(DAY FROM (NOW() - cs.last_workout_at))::INT)
  END AS days_inactive,
  -- Active cycle info
  active_cycle.cycle_name AS protocol_name,
  active_cycle.cycle_ends_at AS protocol_ends_at,
  CASE
    WHEN active_cycle.cycle_ends_at IS NULL THEN NULL
    ELSE GREATEST(0, (active_cycle.cycle_ends_at - CURRENT_DATE))
  END AS days_until_protocol_expires,
  -- Workout stats
  COALESCE((
    SELECT COUNT(DISTINCT DATE(wl.logged_at))
    FROM workout_logs wl
    WHERE wl.student_id = cr.student_id
      AND wl.logged_at >= NOW() - INTERVAL '30 days'
  ), 0)::INT AS workouts_last_30_days,
  COALESCE((
    SELECT COUNT(DISTINCT DATE(wl.logged_at))
    FROM workout_logs wl
    WHERE wl.student_id = cr.student_id
  ), 0)::INT AS total_workout_days
FROM coach_relationships cr
JOIN profiles p ON cr.student_id = p.id
LEFT JOIN crm_student_snapshots cs
  ON cs.student_id = cr.student_id AND cs.coach_id = cr.coach_id
LEFT JOIN LATERAL (
  SELECT
    wc.name AS cycle_name,
    (wc.starts_at + (wc.duration_weeks * 7))::DATE AS cycle_ends_at
  FROM workout_cycles wc
  WHERE wc.student_id = cr.student_id
    AND wc.coach_id = cr.coach_id
    AND wc.status = 'active'
    AND wc.duration_weeks IS NOT NULL
    AND wc.starts_at IS NOT NULL
  ORDER BY wc.created_at DESC
  LIMIT 1
) active_cycle ON true
WHERE cr.status IN ('active', 'pending_payment');

GRANT SELECT ON view_coach_students_crm TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. BACKFILL: Create snapshots for existing relationships
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO crm_student_snapshots (student_id, coach_id, churn_risk_score, is_safe_to_nudge)
SELECT student_id, coach_id, 100, true
FROM coach_relationships
WHERE status IN ('active', 'pending_payment')
ON CONFLICT (student_id, coach_id) DO NOTHING;

-- Backfill last_workout_at from workout_logs
UPDATE crm_student_snapshots cs
SET last_workout_at = sub.last_at
FROM (
  SELECT wl.student_id, MAX(wl.logged_at) AS last_at
  FROM workout_logs wl
  GROUP BY wl.student_id
) sub
WHERE cs.student_id = sub.student_id AND cs.last_workout_at IS NULL;

-- Seed default flows for existing coaches
DO $$
DECLARE
  v_coach RECORD;
BEGIN
  FOR v_coach IN
    SELECT DISTINCT coach_id FROM coach_relationships WHERE status = 'active'
  LOOP
    PERFORM fn_seed_default_flows_for_coach(v_coach.coach_id);
  END LOOP;
END $$;

-- Run initial engagement recalculation
SELECT pulse_recalculate_engagement();
