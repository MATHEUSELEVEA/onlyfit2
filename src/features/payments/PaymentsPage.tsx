import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Ban, CreditCard, Loader2, Plus, ReceiptText, Star, Trash2, Undo2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from '@/i18n/I18nProvider';
import { AddCardSheet } from './AddCardSheet';
import {
  usePaymentCards,
  useDeletePaymentCard,
  useSetDefaultCard,
  type PaymentCard,
} from './usePaymentCards';
import { usePaymentTransactions, type PaymentTransaction } from './usePaymentTransactions';
import { useCancelSubscription, useRefundTransaction, isWithinRefundWindow } from './usePaymentActions';

type PaymentsTab = 'cartoes' | 'pagamentos';

export function PaymentsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: PaymentsTab = searchParams.get('aba') === 'pagamentos' ? 'pagamentos' : 'cartoes';
  const shouldOpenAddCard = searchParams.get('adicionarCartao') === '1';

  const setTab = (next: PaymentsTab) =>
    setSearchParams(next === 'pagamentos' ? { aba: 'pagamentos' } : {}, { replace: true });

  function clearAddCardIntent() {
    const next = new URLSearchParams(searchParams);
    next.delete('adicionarCartao');
    setSearchParams(next, { replace: true });
  }

  const tabs: ReadonlyArray<{ key: PaymentsTab; label: string }> = [
    { key: 'cartoes', label: t('payments.tab.cards') },
    { key: 'pagamentos', label: t('payments.tab.history') },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background">
        <header className="sticky top-0 z-10 border-b border-outline-variant/30 bg-surface-container-lowest/95 px-4 pb-0 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-3 pb-3">
            <Link
              to="/perfil/menu"
              aria-label={t('payments.back')}
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-sans text-title-lg text-on-surface">{t('payments.title')}</h1>
              <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{t('payments.subtitle')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2" role="tablist" aria-label={t('payments.title')}>
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={clsx(
                  'relative min-h-[40px] whitespace-nowrap pb-2 font-sans text-label transition-colors',
                  tab === key ? 'text-on-surface' : 'text-on-surface-variant',
                )}
              >
                {label}
                {tab === key && (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </header>

        <main className="px-4 pt-4">
          {tab === 'cartoes' ? (
            <CardsTab openAddCard={shouldOpenAddCard} onOpenAddCardHandled={clearAddCardIntent} />
          ) : (
            <HistoryTab />
          )}
        </main>
      </div>
    </div>
  );
}

function CardsTab({
  openAddCard,
  onOpenAddCardHandled,
}: {
  openAddCard: boolean;
  onOpenAddCardHandled: () => void;
}) {
  const { t } = useTranslation();
  const { data: cards = [], isLoading, isError } = usePaymentCards();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!openAddCard) return;
    setSheetOpen(true);
    onOpenAddCardHandled();
  }, [openAddCard, onOpenAddCardHandled]);

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary shadow-sm transition-transform active:scale-[0.98]"
      >
        <Plus size={18} aria-hidden />
        {t('payments.card.add')}
      </button>

      {isLoading ? (
        <div className="flex min-h-40 items-center justify-center">
          <Loader2 size={26} className="animate-spin text-primary" aria-label={t('payments.loading')} />
        </div>
      ) : isError ? (
        <p role="alert" className="rounded-2xl bg-error-container p-4 font-sans text-body-sm text-on-error-container">
          {t('payments.card.loadError')}
        </p>
      ) : cards.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={t('payments.card.emptyTitle')}
          description={t('payments.card.emptyDescription')}
        />
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <CardRow key={card.id} card={card} />
          ))}
          <p className="px-1 font-sans text-body-sm text-on-surface-variant">{t('payments.card.defaultHint')}</p>
        </div>
      )}

      <AddCardSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </section>
  );
}

function CardRow({ card }: { card: PaymentCard }) {
  const { t } = useTranslation();
  const setDefault = useSetDefaultCard();
  const deleteCard = useDeletePaymentCard();
  const [error, setError] = useState<string | null>(null);

  const busy = setDefault.isPending || deleteCard.isPending;
  const label = card.nickname || card.brand || t('payments.card.genericBrand');

  function handleDelete() {
    setError(null);
    if (!window.confirm(t('payments.card.deleteConfirm'))) return;
    deleteCard.mutate(card.id, {
      onError: (mutationError) =>
        setError(mutationError instanceof Error ? mutationError.message : t('payments.card.actionError')),
    });
  }

  function handleSetDefault() {
    setError(null);
    setDefault.mutate(card.id, {
      onError: (mutationError) =>
        setError(mutationError instanceof Error ? mutationError.message : t('payments.card.actionError')),
    });
  }

  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CreditCard size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-sans text-body font-medium text-on-surface">{label}</span>
            {card.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-sans text-counter text-primary">
                <Star size={12} aria-hidden />
                {t('payments.card.default')}
              </span>
            )}
          </div>
          <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
            •••• {card.last4}
          </span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {!card.isDefault && (
          <button
            type="button"
            onClick={handleSetDefault}
            disabled={busy}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-surface-container px-3 font-sans text-label text-on-surface transition-colors active:bg-surface-container-high disabled:opacity-60"
          >
            {setDefault.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Star size={15} aria-hidden />}
            {t('payments.card.makeDefault')}
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          aria-label={t('payments.card.delete')}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-error-container px-3 font-sans text-label text-on-error-container transition-colors active:opacity-80 disabled:opacity-60"
        >
          {deleteCard.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Trash2 size={15} aria-hidden />}
          {t('payments.card.delete')}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 font-sans text-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

function HistoryTab() {
  const { t } = useTranslation();
  const { data: transactions = [], isLoading, isError } = usePaymentTransactions();
  if (isLoading) return <div className="flex min-h-40 items-center justify-center"><Loader2 size={26} className="animate-spin text-primary" /></div>;
  if (isError) return <p role="alert" className="rounded-2xl bg-error-container p-4 font-sans text-body-sm text-on-error-container">{t('payments.history.loadError')}</p>;
  if (!transactions.length) return <EmptyState icon={ReceiptText} title={t('payments.history.emptyTitle')} description={t('payments.history.emptyDescription')} />;
  return (
    <section className="space-y-3">
      {transactions.map((transaction) => <PaymentRow key={transaction.id} transaction={transaction} />)}
    </section>
  );
}

function PaymentRow({ transaction }: { transaction: PaymentTransaction }) {
  const { t } = useTranslation();
  const cancelSubscription = useCancelSubscription();
  const refundTransaction = useRefundTransaction();
  const [error, setError] = useState<string | null>(null);

  const statusKey = transaction.settlement_status || transaction.status;
  const labels: Record<string, string> = {
    pending: t('payments.history.status.pending'),
    confirmed: t('payments.history.status.confirmed'),
    settled: t('payments.history.status.settled'),
    refunded: t('payments.history.status.refunded'),
    chargeback: t('payments.history.status.chargeback'),
    failed: t('payments.history.status.failed'),
  };

  const finalized = ['refunded', 'chargeback', 'failed', 'canceled'].includes(transaction.status);
  const canCancel =
    transaction.billing_type === 'recurring' && Boolean(transaction.subscription_id) && !finalized;
  const canRefund =
    transaction.billing_type === 'one_time' &&
    ['confirmed', 'settled'].includes(statusKey) &&
    isWithinRefundWindow(transaction.created_at);
  const busy = cancelSubscription.isPending || refundTransaction.isPending;

  function handleCancel() {
    setError(null);
    if (!transaction.subscription_id) return;
    if (!window.confirm(t('payments.history.cancelConfirm'))) return;
    cancelSubscription.mutate(transaction.subscription_id, {
      onError: (mutationError) =>
        setError(mutationError instanceof Error ? mutationError.message : t('payments.history.actionError')),
    });
  }

  function handleRefund() {
    setError(null);
    if (!window.confirm(t('payments.history.refundConfirm'))) return;
    refundTransaction.mutate(transaction.id, {
      onError: (mutationError) =>
        setError(mutationError instanceof Error ? mutationError.message : t('payments.history.actionError')),
    });
  }

  return (
    <article className="rounded-2xl border border-outline-variant/40 bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><ReceiptText size={18} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-body font-medium text-on-surface">{transaction.billing_type === 'recurring' ? t('payments.history.subscription') : t('payments.history.oneTime')}</p>
          <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{new Date(transaction.created_at).toLocaleDateString()}</p>
        </div>
        <div className="text-right">
          <p className="font-sans text-body font-semibold text-on-surface">{Number(transaction.gross_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          <span className="font-sans text-counter text-on-surface-variant">{labels[statusKey] ?? statusKey}</span>
        </div>
      </div>

      {(canCancel || canRefund) && (
        <div className="mt-3 flex gap-2">
          {canCancel && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-surface-container px-3 font-sans text-label text-on-surface transition-colors active:bg-surface-container-high disabled:opacity-60"
            >
              {cancelSubscription.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Ban size={15} aria-hidden />}
              {t('payments.history.cancelSubscription')}
            </button>
          )}
          {canRefund && (
            <button
              type="button"
              onClick={handleRefund}
              disabled={busy}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-surface-container px-3 font-sans text-label text-on-surface transition-colors active:bg-surface-container-high disabled:opacity-60"
            >
              {refundTransaction.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Undo2 size={15} aria-hidden />}
              {t('payments.history.requestRefund')}
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 font-sans text-body-sm text-error">
          {error}
        </p>
      )}
    </article>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CreditCard;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container/40 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon size={22} aria-hidden />
      </span>
      <div>
        <p className="font-sans text-body font-medium text-on-surface">{title}</p>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{description}</p>
      </div>
    </div>
  );
}
