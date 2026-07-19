import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/translations';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { OfferingConfig } from './offerings';
import { offeringIcon, STATUS_LABEL_KEYS, STATUS_STYLES } from './offerings/offeringVisuals';
import {
  useBusinessOffering,
  useOfferingTypes,
  useUpdateOffering,
  type OfferingStatus,
  type OfferingType,
} from './useBusinessOfferings';

// Helper (não é componente) para não criar um componente dinâmico no corpo do
// render — o ícone vem do catálogo e é resolvido por nome.
function renderOfferingIcon(icon: string | null, size: number) {
  const Icon = offeringIcon(icon);
  return <Icon size={size} aria-hidden />;
}

function mapOfferingError(error: unknown, t: (key: TranslationKey) => string): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('premium_already_enabled_for_profile')) return t('profile.business.offers.error.premiumTaken');
  if (message.includes('offering_limit_reached')) return t('profile.business.offers.error.limit');
  if (message.includes('organization_admin_required')) return t('profile.business.offers.error.notAdmin');
  if (message.includes('invalid_name')) return t('profile.business.offers.error.invalidName');
  return t('profile.business.offers.error.generic');
}

function billingLabel(
  billingType: OfferingType['billing_type'],
  billingInterval: OfferingType['billing_interval'],
  t: (key: TranslationKey) => string,
): string {
  if (billingType === 'free') return t('profile.business.offers.billing.free');
  if (billingType === 'recurring') {
    const intervalKey = `profile.business.offers.billing.interval.${billingInterval ?? 'month'}` as TranslationKey;
    return `${t('profile.business.offers.billing.recurring')} · ${t(intervalKey)}`;
  }
  return t('profile.business.offers.billing.oneTime');
}

export function OfferingManagementPage() {
  const { businessId, offeringId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const backTo = `/negocios/${businessId}`;

  const { data: types = [] } = useOfferingTypes();
  const { data: offering, isLoading, isError } = useBusinessOffering(businessId, offeringId);
  const type = offering ? (types.find((item) => item.slug === offering.offering_type) ?? null) : null;

  const updateMutation = useUpdateOffering(businessId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  // Preenche o formulário quando a oferta carrega (ou troca); o guard por id
  // evita sobrescrever o que o usuário digitou a cada re-render.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (offering && loadedId !== offering.id) {
    setLoadedId(offering.id);
    setName(offering.name);
    setDescription(offering.description ?? '');
    setError(null);
    setConfirmArchive(false);
  }

  function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!offering) return;
    setError(null);
    if (name.trim().length < 3) {
      setError(t('profile.business.offers.error.invalidName'));
      return;
    }
    updateMutation.mutate(
      { offeringId: offering.id, name: name.trim(), description: description.trim() },
      { onError: (mutationError) => setError(mapOfferingError(mutationError, t)) },
    );
  }

  function setStatus(status: OfferingStatus) {
    if (!offering) return;
    setError(null);
    updateMutation.mutate(
      { offeringId: offering.id, status },
      {
        // Arquivar tira a oferta da lista; volta para o negócio.
        onSuccess: () => {
          if (status === 'archived') navigate(backTo);
        },
        onError: (mutationError) => setError(mapOfferingError(mutationError, t)),
      },
    );
  }

  const statusAction: { label: string; status: OfferingStatus } | null = offering
    ? offering.status === 'draft'
      ? { label: t('profile.business.offers.activate'), status: 'active' }
      : offering.status === 'active'
        ? { label: t('profile.business.offers.pause'), status: 'paused' }
        : { label: t('profile.business.offers.reactivate'), status: 'active' }
    : null;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto min-h-full w-full max-w-[640px] bg-background">
        <header className="sticky top-0 z-10 border-b border-outline-variant/20 bg-background/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              to={backTo}
              aria-label={t('profile.business.offers.backToBusiness')}
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <h1 className="truncate font-sans text-title-lg text-on-surface">
              {offering?.name ?? t('profile.business.offers.manage')}
            </h1>
          </div>
        </header>

        <main className="px-4 pb-10 pt-6">
          {isLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 size={28} className="animate-spin text-primary" aria-label={t('profile.business.loading')} />
            </div>
          ) : isError || !offering ? (
            <div className="rounded-2xl bg-error-container p-4 text-on-error-container" role="alert">
              <p className="font-sans text-body font-semibold">{t('profile.business.offers.notFound')}</p>
              <Link to={backTo} className="mt-3 inline-flex min-h-11 items-center font-sans text-label underline">
                {t('profile.business.offers.backToBusiness')}
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  {renderOfferingIcon(type?.icon ?? null, 27)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-sans text-title text-on-surface">{offering.name}</h2>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 font-sans text-counter ${STATUS_STYLES[offering.status as Exclude<OfferingStatus, 'archived'>] ?? STATUS_STYLES.draft}`}
                    >
                      {t(STATUS_LABEL_KEYS[offering.status])}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-sans text-body-sm text-on-surface-variant">
                    {type?.name ?? offering.offering_type} · {billingLabel(offering.billing_type, offering.billing_interval, t)}
                  </p>
                </div>
              </div>

              <section className="mt-6 rounded-2xl bg-surface-container p-4" aria-labelledby="offering-billing-title">
                <h3 id="offering-billing-title" className="font-sans text-label text-on-surface">
                  {t('profile.business.offers.billing.lockedTitle')}
                </h3>
                <p className="mt-1 font-sans text-body text-primary">
                  {billingLabel(offering.billing_type, offering.billing_interval, t)}
                </p>
                <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                  {t('profile.business.offers.billing.lockedHint')}
                </p>
              </section>

              {/* Configuração específica do tipo — construída em fases futuras. */}
              <section className="mt-8" aria-labelledby="offering-config-title">
                <h3 id="offering-config-title" className="px-1 font-sans text-label text-on-surface">
                  {t('profile.business.offers.config.title')}
                </h3>
                <div className="mt-2">
                  <OfferingConfig offering={offering} type={type} />
                </div>
              </section>

              {/* Detalhes comuns a qualquer oferta. */}
              <section className="mt-8" aria-labelledby="offering-details-title">
                <h3 id="offering-details-title" className="px-1 font-sans text-label text-on-surface">
                  {t('profile.business.offers.details')}
                </h3>
                <form onSubmit={saveDetails} className="mt-2 space-y-4 rounded-2xl bg-surface-container p-5">
                  <TextField
                    label={t('profile.business.offers.name')}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={96}
                    disabled={updateMutation.isPending}
                    error={error ?? undefined}
                  />
                  <TextAreaField
                    label={t('profile.business.offers.description')}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    maxLength={400}
                    disabled={updateMutation.isPending}
                  />
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                  >
                    {updateMutation.isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
                    {updateMutation.isPending ? t('profile.business.offers.saving') : t('profile.business.offers.save')}
                  </button>
                </form>
              </section>

              {/* Disponibilidade: ativar/pausar/reativar e arquivar. */}
              <section className="mt-8" aria-labelledby="offering-availability-title">
                <h3 id="offering-availability-title" className="px-1 font-sans text-label text-on-surface">
                  {t('profile.business.offers.availability')}
                </h3>
                <p className="mt-1 px-1 font-sans text-body-sm text-on-surface-variant">
                  {t('profile.business.offers.availabilityHint')}
                </p>
                <div className="mt-2 flex gap-2">
                  {statusAction && (
                    <button
                      type="button"
                      disabled={updateMutation.isPending}
                      onClick={() => setStatus(statusAction.status)}
                      className="min-h-11 flex-1 rounded-xl bg-surface-container px-4 font-sans text-label text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                    >
                      {statusAction.label}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={updateMutation.isPending}
                    onClick={() => (confirmArchive ? setStatus('archived') : setConfirmArchive(true))}
                    className="min-h-11 flex-1 rounded-xl bg-error-container px-4 font-sans text-label text-on-error-container transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                  >
                    {confirmArchive ? t('profile.business.offers.archiveConfirm') : t('profile.business.offers.archive')}
                  </button>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
