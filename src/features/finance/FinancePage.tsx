import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Wallet, ArrowDownToLine } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';

// Shell do Financeiro do profissional. A UX (saldo a liquidar / disponível /
// extrato) vale para as duas opções de custódia em estudo — a fonte real do
// saldo entra depois da decisão do modelo de pagamento (ver ESPECIFICACAO-
// PAGAMENTOS §2/§11). Por ora, saldos zerados e extrato vazio.
export function FinancePage() {
  const { t } = useTranslation();

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background">
        <header className="sticky top-0 z-10 border-b border-outline-variant/30 bg-surface-container-lowest/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              to="/perfil/menu"
              aria-label={t('finance.back')}
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-sans text-title-lg text-on-surface">{t('finance.title')}</h1>
              <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{t('finance.subtitle')}</p>
            </div>
          </div>
        </header>

        <main className="space-y-6 px-4 pt-5">
          <div className="grid grid-cols-2 gap-3">
            <BalanceCard
              icon={Clock}
              label={t('finance.pendingBalance')}
              value="R$ 0,00"
              hint={t('finance.pendingHint')}
            />
            <BalanceCard
              icon={Wallet}
              label={t('finance.availableBalance')}
              value="R$ 0,00"
              hint={t('finance.availableHint')}
            />
          </div>

          <button
            type="button"
            disabled
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-surface-container px-5 font-sans text-label text-on-surface-variant opacity-70"
          >
            <ArrowDownToLine size={18} aria-hidden />
            {t('finance.requestPayout')}
          </button>

          <section className="space-y-3">
            <h2 className="px-1 font-sans text-label text-on-surface">{t('finance.statementTitle')}</h2>
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container/40 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Wallet size={22} aria-hidden />
              </span>
              <div>
                <p className="font-sans text-body font-medium text-on-surface">{t('finance.emptyTitle')}</p>
                <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('finance.emptyDescription')}</p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function BalanceCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-sans text-body-sm text-on-surface-variant">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon size={16} aria-hidden />
        </span>
      </div>
      <p className="mt-2 font-sans text-title-lg text-on-surface tabular-nums">{value}</p>
      <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{hint}</p>
    </div>
  );
}
