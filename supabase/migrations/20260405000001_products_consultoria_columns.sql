-- Planos de consultoria (Financeiro): colunas usadas por CreatePlanModal e listagem.
-- Garante que products tenha active, interval e payment_types para evitar PGRST204.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS interval TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS payment_types TEXT[] DEFAULT ARRAY['pix', 'boleto'];

COMMENT ON COLUMN public.products.active IS 'Se false, plano não aparece na listagem (consultoria).';
COMMENT ON COLUMN public.products.interval IS 'Recorrência: month, year ou null para pagamento único.';
COMMENT ON COLUMN public.products.payment_types IS 'Meios de pagamento aceitos: card, pix, boleto.';
