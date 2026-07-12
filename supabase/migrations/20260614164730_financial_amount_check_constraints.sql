-- hm-data-integrity D4 (runtime integrity) — invariante de dinheiro no nível do DB.
-- Antes não havia CHECK garantindo valores não-negativos; um bug no app/edge poderia
-- gravar amount/price negativo (validação client-side não é garantia — A04/OWASP).
-- Dados atuais verificados: zero linhas negativas, então a validação é imediata e segura.
-- Idempotente via DO/IF NOT EXISTS.

do $$
begin
  if not exists (select 1 from pg_constraint where conname='pulse_checkouts_amount_nonneg') then
    alter table public.pulse_checkouts add constraint pulse_checkouts_amount_nonneg check (amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='pulse_charges_amount_due_nonneg') then
    alter table public.pulse_charges add constraint pulse_charges_amount_due_nonneg check (amount_due >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='pulse_subscriptions_price_nonneg') then
    alter table public.pulse_subscriptions add constraint pulse_subscriptions_price_nonneg check (price >= 0);
  end if;
end $$;
