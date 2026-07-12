-- IAM Fintech P0: assurance_level, cpf_hash (LGPD), trusted_devices, security_events, RLS gates
-- Compatível com state machine em docs/IAM_FINTECH_STATE_MACHINE.md
-- cpf_hash: deve ser HMAC-SHA256(cpf, pepper) calculado fora do DB (Edge Function/backend); aqui só armazenamos.

-- ========== 1) profiles: colunas de assurance e CPF blindado ==========
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf_hash TEXT,
  ADD COLUMN IF NOT EXISTS cpf_last4 TEXT,
  ADD COLUMN IF NOT EXISTS assurance_level SMALLINT DEFAULT 0
    CHECK (assurance_level IN (0, 1, 2)),
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.cpf_hash IS 'HMAC-SHA256(cpf, pepper) gerado fora do DB; nunca CPF em texto';
COMMENT ON COLUMN public.profiles.cpf_last4 IS 'Últimos 4 dígitos para UX (ex: ***.***.***-89)';
COMMENT ON COLUMN public.profiles.assurance_level IS '0= L0 básico, 1= L1 posse forte, 2= L2 KYC verificado';
COMMENT ON COLUMN public.profiles.email_verified_at IS 'Quando o e-mail foi verificado (OTP/link)';
COMMENT ON COLUMN public.profiles.phone_verified_at IS 'Quando o telefone foi verificado (OTP)';

-- Unicidade: um CPF (hash) só pode estar em uma conta
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cpf_hash_unique
  ON public.profiles (cpf_hash) WHERE cpf_hash IS NOT NULL;

-- Índice para RLS: lookup por auth.uid() já existe em profiles.id PK
CREATE INDEX IF NOT EXISTS idx_profiles_assurance_level ON public.profiles (id, assurance_level);

-- ========== 2) trusted_devices (device binding) ==========
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  name TEXT,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id ON public.trusted_devices(user_id);

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own trusted_devices" ON public.trusted_devices;
CREATE POLICY "Users manage own trusted_devices"
  ON public.trusted_devices FOR ALL
  USING (auth.uid() = user_id);

-- ========== 3) security_events (append-only, sem PII) ==========
CREATE TABLE IF NOT EXISTS public.security_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_hash TEXT,
  device_id TEXT,
  risk_score SMALLINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON public.security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type_created ON public.security_events(event_type, created_at DESC);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Apenas service_role ou RPC com SECURITY DEFINER insere; leitura para o próprio user (ou admin)
DROP POLICY IF EXISTS "Users see own security_events" ON public.security_events;
CREATE POLICY "Users see own security_events"
  ON public.security_events FOR SELECT
  USING (auth.uid() = user_id);

-- Inserção só via RPC (evita cliente inserir direto)
-- CREATE POLICY para INSERT não dado; usar RPC log_security_event (SECURITY DEFINER)

-- ========== 4) RPC: obter assurance_level do usuário (para RLS e app) ==========
CREATE OR REPLACE FUNCTION public.get_my_assurance_level()
RETURNS SMALLINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT assurance_level FROM public.profiles WHERE id = auth.uid()), 0);
$$;

REVOKE ALL ON FUNCTION public.get_my_assurance_level() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_assurance_level() TO authenticated;

-- ========== 5) RPC: registrar security_event (chamado por backend/Edge Function) ==========
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type TEXT,
  p_user_id UUID DEFAULT auth.uid(),
  p_ip_hash TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_risk_score SMALLINT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_events (event_type, user_id, ip_hash, device_id, risk_score)
  VALUES (p_event_type, p_user_id, p_ip_hash, p_device_id, p_risk_score);
END;
$$;

REVOKE ALL ON FUNCTION public.log_security_event(TEXT, UUID, TEXT, TEXT, SMALLINT) FROM public;
GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, UUID, TEXT, TEXT, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, UUID, TEXT, TEXT, SMALLINT) TO service_role;

-- ========== 6) RPC: associar CPF (hash + last4) à conta — chamar com hash já calculado fora ==========
CREATE OR REPLACE FUNCTION public.set_cpf_hash_for_user(
  p_cpf_hash TEXT,
  p_cpf_last4 TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_existing UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_cpf_hash IS NULL OR length(trim(p_cpf_hash)) < 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_cpf_hash');
  END IF;

  SELECT id INTO v_existing FROM public.profiles WHERE cpf_hash = p_cpf_hash AND id <> v_uid LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_already_claimed');
  END IF;

  UPDATE public.profiles
  SET cpf_hash = p_cpf_hash,
      cpf_last4 = left(p_cpf_last4, 4)
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_cpf_hash_for_user(TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.set_cpf_hash_for_user(TEXT, TEXT) TO authenticated;

-- ========== 7) RLS gates por assurance_level (exemplos) ==========
-- Uso: nas policies, (SELECT public.get_my_assurance_level()) >= N restringe por nível.
-- L0 = autenticado básico, L1 = posse forte, L2 = KYC verificado.

-- Exemplo: policy que exige L1 para atualizar e-mail/telefone no próprio perfil.
-- (Não alteramos políticas globais de profiles aqui; apenas criamos helper e documentamos.)
-- Para aplicar gate L1 em uma tabela sensível, use:
--   USING (auth.uid() = user_id AND (SELECT public.get_my_assurance_level()) >= 1)
-- Para gate L2 (ex.: área financeira):
--   USING ((SELECT public.get_my_assurance_level()) >= 2)

-- Policy de exemplo: leitura do próprio perfil (incluindo assurance_level) — qualquer autenticado
-- (Se já existir policy genérica em profiles, não duplicar. Abaixo: exemplo para tabela futura.)

-- Exemplo para tabela que só L2 pode acessar (criar quando houver tabela de export/dados sensíveis):
-- CREATE POLICY "L2 only" ON sensitive_data
--   FOR SELECT USING (
--     auth.uid() = user_id AND (SELECT public.get_my_assurance_level()) >= 2
--   );
