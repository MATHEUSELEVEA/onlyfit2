-- =============================================================================
-- Pulse message template engine (fase 1): tabelas sistema + override + exceções
-- + auditoria de envio + colunas em pulse_action_outbox. Rodapé não fica no DB.
-- =============================================================================

-- 1) Template oficial OnlyFit por trigger_type
CREATE TABLE IF NOT EXISTS public.pulse_flow_template_system (
  trigger_type TEXT PRIMARY KEY,
  body_template TEXT NOT NULL,
  intent TEXT NOT NULL,
  tone_level TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  audience TEXT NOT NULL DEFAULT 'STUDENT',
  channel TEXT NOT NULL DEFAULT 'WHATSAPP',
  template_version INT NOT NULL DEFAULT 1,
  max_body_lines INT NOT NULL DEFAULT 25,
  ai_refinement_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pulse_flow_template_system_intent_chk
    CHECK (intent IN ('welcome', 'retention', 'recovery', 'celebration', 'payment', 'alert')),
  CONSTRAINT pulse_flow_template_system_tone_chk
    CHECK (tone_level IN ('light', 'normal', 'firm', 'urgent')),
  CONSTRAINT pulse_flow_template_system_priority_chk
    CHECK (priority IN ('high', 'normal', 'low')),
  CONSTRAINT pulse_flow_template_system_audience_chk
    CHECK (audience IN ('STUDENT', 'COACH', 'INTERNAL'))
);

COMMENT ON TABLE public.pulse_flow_template_system IS
  'Biblioteca de templates de sistema (imutável via app); corpo sem rodapé OnlyFit.';

CREATE INDEX IF NOT EXISTS idx_pulse_flow_template_system_audience
  ON public.pulse_flow_template_system (audience);

-- 2) Override por coach (lazy)
CREATE TABLE IF NOT EXISTS public.pulse_flow_coach_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL REFERENCES public.pulse_flow_template_system(trigger_type) ON UPDATE CASCADE ON DELETE RESTRICT,
  custom_body_template TEXT,
  uses_system_default BOOLEAN NOT NULL DEFAULT true,
  pinned_system_version INT,
  customized_at TIMESTAMPTZ,
  last_editor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, trigger_type)
);

CREATE INDEX IF NOT EXISTS idx_pulse_flow_coach_override_coach
  ON public.pulse_flow_coach_override (coach_id);

-- 3) Exceções por aluno (BLOCKLIST / ALLOWLIST)
CREATE TABLE IF NOT EXISTS public.pulse_flow_student_delivery_rule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pulse_flow_student_delivery_rule_mode_chk
    CHECK (mode IN ('BLOCKLIST', 'ALLOWLIST')),
  UNIQUE (coach_id, trigger_type, student_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_flow_student_rule_coach_trigger
  ON public.pulse_flow_student_delivery_rule (coach_id, trigger_type);

CREATE INDEX IF NOT EXISTS idx_pulse_flow_student_rule_student
  ON public.pulse_flow_student_delivery_rule (student_id);

COMMENT ON TABLE public.pulse_flow_student_delivery_rule IS
  'BLOCKLIST: não enviar este trigger a este aluno; ALLOWLIST: só estes alunos (quando fluxo em modo restrito — enforcement na engine).';

-- 4) Auditoria de envio (append)
CREATE TABLE IF NOT EXISTS public.pulse_message_send_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID REFERENCES public.pulse_action_outbox(id) ON DELETE SET NULL,
  coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL,
  audience TEXT,
  template_version INT,
  used_coach_override BOOLEAN NOT NULL DEFAULT false,
  placeholders_resolved JSONB NOT NULL DEFAULT '{}'::jsonb,
  body_final TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pulse_message_send_audit_coach_sent
  ON public.pulse_message_send_audit (coach_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_pulse_message_send_audit_outbox
  ON public.pulse_message_send_audit (outbox_id);

-- 5) Outbox — orquestração (sem quebrar RPC existente)
ALTER TABLE public.pulse_action_outbox
  ADD COLUMN IF NOT EXISTS message_priority TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE public.pulse_action_outbox
  ADD COLUMN IF NOT EXISTS cooldown_bypass BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.pulse_action_outbox
  ADD COLUMN IF NOT EXISTS template_version_resolved INT;

ALTER TABLE public.pulse_action_outbox
  DROP CONSTRAINT IF EXISTS pulse_action_outbox_message_priority_chk;

ALTER TABLE public.pulse_action_outbox
  ADD CONSTRAINT pulse_action_outbox_message_priority_chk
  CHECK (message_priority IN ('high', 'normal', 'low'));

COMMENT ON COLUMN public.pulse_action_outbox.message_priority IS
  'Prioridade de orquestração (high/normal/low); não confundir com outras colunas legacy.';

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.pulse_flow_template_system ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_flow_coach_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_flow_student_delivery_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_message_send_audit ENABLE ROW LEVEL SECURITY;

-- Sistema: leitura para qualquer autenticado (coach vê catálogo oficial)
DROP POLICY IF EXISTS pulse_flow_template_system_select_authenticated ON public.pulse_flow_template_system;
CREATE POLICY pulse_flow_template_system_select_authenticated
  ON public.pulse_flow_template_system FOR SELECT
  TO authenticated
  USING (true);

-- Coach: override próprio
DROP POLICY IF EXISTS pulse_flow_coach_override_all_own ON public.pulse_flow_coach_override;
CREATE POLICY pulse_flow_coach_override_all_own
  ON public.pulse_flow_coach_override FOR ALL
  TO authenticated
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

-- Coach: regras de entrega próprias
DROP POLICY IF EXISTS pulse_flow_student_delivery_rule_all_own ON public.pulse_flow_student_delivery_rule;
CREATE POLICY pulse_flow_student_delivery_rule_all_own
  ON public.pulse_flow_student_delivery_rule FOR ALL
  TO authenticated
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

-- Auditoria: coach lê as suas linhas
DROP POLICY IF EXISTS pulse_message_send_audit_select_own ON public.pulse_message_send_audit;
CREATE POLICY pulse_message_send_audit_select_own
  ON public.pulse_message_send_audit FOR SELECT
  TO authenticated
  USING (auth.uid() = coach_id);

-- service_role: bypass RLS padrão Supabase — grants explícitos
GRANT SELECT ON public.pulse_flow_template_system TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_flow_coach_override TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_flow_student_delivery_rule TO authenticated;
GRANT SELECT ON public.pulse_message_send_audit TO authenticated;

GRANT ALL ON public.pulse_flow_template_system TO service_role;
GRANT ALL ON public.pulse_flow_coach_override TO service_role;
GRANT ALL ON public.pulse_flow_student_delivery_rule TO service_role;
GRANT ALL ON public.pulse_message_send_audit TO service_role;

-- -----------------------------------------------------------------------------
-- Seeds idempotentes (corpo sem rodapé; footer aplicado só no backend)
-- -----------------------------------------------------------------------------
INSERT INTO public.pulse_flow_template_system (
  trigger_type, body_template, intent, tone_level, priority, audience, channel, template_version, max_body_lines
) VALUES
(
  'NEW_STUDENT',
  E'Olá, {{primeiro_nome}}! Seja muito bem-vindo(a)!\n\nEstou passando para te dar as boas-vindas e dizer que agora vamos começar essa jornada juntos.\n\nSempre que precisar, conte comigo e com a equipe para te acompanhar de perto.\n\nVamos em frente!',
  'welcome', 'normal', 'normal', 'STUDENT', 'WHATSAPP', 1, 20
),
(
  'PROTOCOL_ASSIGNED',
  E'Olá, {{primeiro_nome}}! Tudo bem?\n\nQuero saber como você está se sentindo com o seu protocolo {{nome_protocolo}} nesses primeiros dias.\n\nEstá conseguindo se adaptar bem? Se tiver qualquer dificuldade, me fala por aqui para eu te ajudar e ajustar o que for preciso.',
  'retention', 'light', 'normal', 'STUDENT', 'WHATSAPP', 1, 20
),
(
  'INACTIVITY_3_DAYS',
  E'Olá, {{primeiro_nome}}! Passando para te lembrar de não perder o ritmo.\n\nJá faz alguns dias desde o seu último treino, e manter a consistência faz toda a diferença no seu resultado.\n\nSe precisar de ajuda para retomar, me chama por aqui.',
  'retention', 'light', 'normal', 'STUDENT', 'WHATSAPP', 1, 18
),
(
  'INACTIVITY_7_DAYS',
  E'Olá, {{primeiro_nome}}! Tudo bem?\n\nPercebi que você já está há alguns dias sem treinar, e quis passar aqui para te incentivar a retomar sua rotina.\n\nSe aconteceu alguma dificuldade, me chama. Posso te ajudar a reorganizar isso da melhor forma.\n\nNão deixa seu processo parar.',
  'retention', 'firm', 'normal', 'STUDENT', 'WHATSAPP', 1, 22
),
(
  'PROTOCOL_EXPIRING',
  E'Atenção: o protocolo de {{primeiro_nome}} está próximo do vencimento.\n\nProtocolo: {{nome_protocolo}}\nExpira em: {{data_expiracao}}\n\nAvalie a necessidade de renovação ou atualização.',
  'alert', 'normal', 'normal', 'COACH', 'WHATSAPP', 1, 15
),
(
  'PROTOCOL_EXPIRED',
  E'Olá, {{primeiro_nome}}! Tudo bem?\n\nO seu protocolo atual foi finalizado e pode ser o momento de renovar ou atualizar a sua próxima etapa.\n\nMe chama por aqui para darmos continuidade ao seu acompanhamento.',
  'retention', 'normal', 'normal', 'STUDENT', 'WHATSAPP', 1, 18
),
(
  'STREAK_10',
  E'Parabéns, {{primeiro_nome}}!\n\nVocê completou 10 treinos, e isso mostra que está construindo consistência de verdade.\n\nSiga assim. Cada treino conta no seu resultado.',
  'celebration', 'normal', 'low', 'STUDENT', 'WHATSAPP', 1, 15
),
(
  'STREAK_30',
  E'Parabéns, {{primeiro_nome}}!\n\nVocê chegou à marca de 30 treinos completados. Isso é resultado de esforço, disciplina e compromisso com a sua evolução.\n\nContinue firme, porque esse é o caminho.',
  'celebration', 'normal', 'low', 'STUDENT', 'WHATSAPP', 1, 18
),
(
  'PAYMENT_FAILED',
  E'Olá, {{primeiro_nome}}! Tudo bem?\n\nIdentificamos uma pendência no seu pagamento. Pode ter sido apenas uma falha momentânea.\n\nQuando puder, dá uma olhada para regularizar e manter seu acompanhamento normalmente.\n\nLink: {{link_pagamento}}',
  'payment', 'light', 'high', 'STUDENT', 'WHATSAPP', 1, 18
),
(
  'PAYMENT_WARNING_3_DAYS',
  E'Olá, {{primeiro_nome}}.\n\nSeu pagamento ainda consta como pendente, e é importante regularizar essa situação para evitar impacto no seu acompanhamento.\n\nSegue novamente o link para acerto:\n{{link_pagamento}}\n\nSe precisar de suporte, me chama por aqui.',
  'payment', 'firm', 'high', 'STUDENT', 'WHATSAPP', 1, 20
),
(
  'BIRTHDAY',
  E'Olá, {{primeiro_nome}}!\n\nPassando para te desejar um feliz aniversário, com muita saúde, conquistas e evolução.\n\nQue seu novo ciclo seja excelente em todos os sentidos.\n\nParabéns pelo seu dia!',
  'celebration', 'light', 'low', 'STUDENT', 'WHATSAPP', 1, 18
),
(
  'MONTHLY_REPORT',
  E'Resumo mensal disponível para {{mes_referencia}}.\n\nAluno: {{primeiro_nome}}\nTreinos concluídos: {{treinos_concluidos}}\nFrequência: {{frequencia_percentual}}%\nStatus do protocolo: {{status_protocolo}}\n\nRevise os dados e identifique oportunidades de acompanhamento.',
  'alert', 'normal', 'low', 'COACH', 'WHATSAPP', 1, 20
),
(
  'MONTHLY_REPORT_TEASER',
  E'Olá, {{primeiro_nome}}! Saiu seu resumo do mês no app. Abre o OnlyFit para ver os detalhes e continuar firme na evolução.',
  'retention', 'normal', 'normal', 'STUDENT', 'WHATSAPP', 1, 12
),
(
  'CHECKOUT_ABANDONED',
  E'Olá, {{primeiro_nome}}! Vi que você não concluiu o pagamento. Se tiver qualquer dúvida ou problema no link, me chama.\n\nLink: {{link_pagamento}}',
  'recovery', 'light', 'high', 'STUDENT', 'WHATSAPP', 1, 14
),
(
  'CHECKOUT_LINK_SENT',
  E'Olá, {{primeiro_nome}}! Te enviei o link de pagamento. Quando puder, finaliza para seguirmos sem interrupção.\n\n{{link_pagamento}}',
  'payment', 'light', 'high', 'STUDENT', 'WHATSAPP', 1, 12
),
(
  'PAYMENT_REMINDER_PRE_DUE',
  E'Olá, {{primeiro_nome}}! Só passando para lembrar: sua renovação está chegando. Vamos manter o ritmo dos treinos!\n\n{{link_pagamento}}',
  'payment', 'light', 'normal', 'STUDENT', 'WHATSAPP', 1, 12
),
(
  'PIX_EXPIRING_SOON',
  E'Olá, {{primeiro_nome}}! O PIX está perto de expirar. Conclui o pagamento para não perder a vaga.\n\n{{link_pagamento}}',
  'payment', 'urgent', 'high', 'STUDENT', 'WHATSAPP', 1, 12
),
(
  'WELCOME_BACK_PAUSE',
  E'Olá, {{primeiro_nome}}! Que bom te ver de volta. Se precisar reorganizar o treino ou tiver dúvidas, estou por aqui.',
  'welcome', 'normal', 'normal', 'STUDENT', 'WHATSAPP', 1, 12
)
ON CONFLICT (trigger_type) DO NOTHING;

-- updated_at triggers (reutilizar handle_updated_at se existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at_pulse_flow_template_system ON public.pulse_flow_template_system;
    CREATE TRIGGER set_updated_at_pulse_flow_template_system
      BEFORE UPDATE ON public.pulse_flow_template_system
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

    DROP TRIGGER IF EXISTS set_updated_at_pulse_flow_coach_override ON public.pulse_flow_coach_override;
    CREATE TRIGGER set_updated_at_pulse_flow_coach_override
      BEFORE UPDATE ON public.pulse_flow_coach_override
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

    DROP TRIGGER IF EXISTS set_updated_at_pulse_flow_student_delivery_rule ON public.pulse_flow_student_delivery_rule;
    CREATE TRIGGER set_updated_at_pulse_flow_student_delivery_rule
      BEFORE UPDATE ON public.pulse_flow_student_delivery_rule
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;
