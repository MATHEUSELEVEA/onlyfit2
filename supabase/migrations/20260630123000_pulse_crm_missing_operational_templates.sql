-- Completa o catálogo operacional usado por CRM, Financeiro e lembretes de nutrição.
-- Sem estes templates, linhas PENDING podem falhar na promoção para envio.

INSERT INTO public.pulse_flow_template_system (
  trigger_type,
  body_template,
  intent,
  tone_level,
  priority,
  audience,
  channel,
  template_version,
  max_body_lines
) VALUES
(
  'PAYMENT_LOCKDOWN',
  E'Olá, {{primeiro_nome}}. Seu pagamento continua pendente e o acesso pode ser pausado até a regularização.\n\nPara resolver, use este link:\n{{link_pagamento}}\n\nSe precisar de ajuda, me chama por aqui.',
  'payment', 'firm', 'high', 'STUDENT', 'WHATSAPP', 1, 14
),
(
  'MANUAL_DUNNING',
  E'Olá, {{primeiro_nome}}. Passando para lembrar da pendência do pagamento.\n\nVocê pode regularizar por aqui:\n{{link_pagamento}}\n\nQualquer dúvida, me chama.',
  'payment', 'normal', 'high', 'STUDENT', 'WHATSAPP', 1, 12
),
(
  'LINK_REQUEST',
  E'Olá, {{primeiro_nome}}. Enviei uma solicitação para vincular seu acompanhamento no OnlyFit.\n\nAbra o app para aceitar e continuar comigo por lá.',
  'welcome', 'normal', 'normal', 'STUDENT', 'WHATSAPP', 1, 10
),
(
  'NUTRITION_MEAL_REMINDER',
  E'Olá, {{primeiro_nome}}. Passando para lembrar da refeição: {{refeicao_nome}}.\n\nHorário previsto: {{refeicao_horario}}.',
  'retention', 'light', 'normal', 'STUDENT', 'WHATSAPP', 1, 8
),
(
  'NUTRITION_SUPPLEMENT_REMINDER',
  E'Olá, {{primeiro_nome}}. Lembrete do suplemento: {{suplemento_nome}}.\n\nHorário: {{suplemento_horario}}.',
  'retention', 'light', 'normal', 'STUDENT', 'WHATSAPP', 1, 8
)
ON CONFLICT (trigger_type) DO UPDATE SET
  body_template = EXCLUDED.body_template,
  intent = EXCLUDED.intent,
  tone_level = EXCLUDED.tone_level,
  priority = EXCLUDED.priority,
  audience = EXCLUDED.audience,
  channel = EXCLUDED.channel,
  template_version = GREATEST(public.pulse_flow_template_system.template_version, EXCLUDED.template_version),
  max_body_lines = EXCLUDED.max_body_lines,
  updated_at = now();

