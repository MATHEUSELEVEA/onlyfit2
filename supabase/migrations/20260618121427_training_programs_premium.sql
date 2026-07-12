-- MVP 5 — Monetização: SEM modelo novo. Programas de coach podem ser premium e são
-- liberados pela MESMA assinatura do criador (modelo "academia"). Templates do
-- sistema (owner_id NULL) permanecem sempre gratuitos.
ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;
