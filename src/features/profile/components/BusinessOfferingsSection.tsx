import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, Plus } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/translations';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { offeringIcon, STATUS_LABEL_KEYS, STATUS_STYLES } from '../offerings/offeringVisuals';
import {
  useBusinessOfferings,
  useCreateOffering,
  useOfferingTypes,
  type BusinessOffering,
  type OfferingType,
  type OfferingStatus,
} from '../useBusinessOfferings';

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

export function BusinessOfferingsSection({
  businessId,
  canManage,
}: {
  businessId: string;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: types = [] } = useOfferingTypes();
  const { data: offerings = [], isLoading, isError } = useBusinessOfferings(businessId);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<OfferingType | null>(null);

  const typeBySlug = new Map(types.map((type) => [type.slug, type]));

  return (
    <section className="mt-8" aria-labelledby="offerings-title">
      <h2 id="offerings-title" className="px-1 font-sans text-label text-on-surface">
        {t('profile.business.offers.title')}
      </h2>
      <p className="mt-1 px-1 font-sans text-body-sm text-on-surface-variant">
        {t('profile.business.offers.hint')}
      </p>

      <div className="mt-2 overflow-hidden rounded-2xl bg-surface-container">
        {isLoading ? (
          <div className="flex min-h-20 items-center justify-center">
            <Loader2 size={22} className="animate-spin text-primary" aria-label={t('profile.business.loading')} />
          </div>
        ) : isError ? (
          <p className="px-4 py-4 font-sans text-body-sm text-on-surface-variant" role="alert">
            {t('profile.business.offers.loadError')}
          </p>
        ) : (
          <>
            {offerings.length === 0 && !canManage && (
              <p className="px-4 py-4 font-sans text-body-sm text-on-surface-variant">
                {t('profile.business.offers.empty')}
              </p>
            )}
            {offerings.map((offering) => {
              const type = typeBySlug.get(offering.offering_type);
              const Icon = offeringIcon(type?.icon ?? null);
              const row = (
                <>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon size={20} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-body font-semibold text-on-surface">
                      {offering.name}
                    </span>
                  <span className="mt-0.5 block truncate font-sans text-body-sm text-on-surface-variant">
                      {type?.name ?? offering.offering_type} · {billingLabel(offering.billing_type, offering.billing_interval, t)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 font-sans text-counter ${STATUS_STYLES[offering.status as Exclude<OfferingStatus, 'archived'>] ?? STATUS_STYLES.draft}`}
                  >
                    {t(STATUS_LABEL_KEYS[offering.status])}
                  </span>
                  {canManage && <ChevronRight size={18} className="shrink-0 text-on-surface-variant" aria-hidden />}
                </>
              );
              return canManage ? (
                <button
                  key={offering.id}
                  type="button"
                  onClick={() => navigate(`/negocios/${businessId}/ofertas/${offering.id}`)}
                  className="flex w-full items-center gap-3 border-b border-outline-variant/15 px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-surface-container-high"
                >
                  {row}
                </button>
              ) : (
                <div
                  key={offering.id}
                  className="flex w-full items-center gap-3 border-b border-outline-variant/15 px-4 py-3.5 last:border-b-0"
                >
                  {row}
                </div>
              );
            })}
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setSelectedType(null);
                  setCreateOpen(true);
                }}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-surface-container-high"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Plus size={20} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans text-body font-semibold text-primary">
                    {t('profile.business.offers.new')}
                  </span>
                  <span className="mt-0.5 block truncate font-sans text-body-sm text-on-surface-variant">
                    {t('profile.business.offers.newHint')}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-primary" aria-hidden />
              </button>
            )}
          </>
        )}
      </div>

      <CreateOfferingSheet
        businessId={businessId}
        open={createOpen}
        types={types}
        offerings={offerings}
        selectedType={selectedType}
        onSelectType={setSelectedType}
        onClose={() => setCreateOpen(false)}
      />
    </section>
  );
}

function CreateOfferingSheet({
  businessId,
  open,
  types,
  offerings,
  selectedType,
  onSelectType,
  onClose,
}: {
  businessId: string;
  open: boolean;
  types: OfferingType[];
  offerings: BusinessOffering[];
  selectedType: OfferingType | null;
  onSelectType: (type: OfferingType | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createMutation = useCreateOffering(businessId);

  function close() {
    if (createMutation.isPending) return;
    onClose();
    onSelectType(null);
    setName('');
    setDescription('');
    setError(null);
  }

  function pickType(type: OfferingType) {
    onSelectType(type);
    setName(type.name);
    setDescription('');
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedType) return;
    setError(null);
    if (name.trim().length < 3) {
      setError(t('profile.business.offers.error.invalidName'));
      return;
    }
    createMutation.mutate(
      { offeringType: selectedType.slug, name: name.trim(), description: description.trim() },
      {
        onSuccess: close,
        onError: (mutationError) => setError(mapOfferingError(mutationError, t)),
      },
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={t('profile.business.offers.new')}
      description={selectedType ? selectedType.name : t('profile.business.offers.chooseType')}
    >
      {!selectedType ? (
        <div className="space-y-2 px-5 pb-6 pt-4">
          {types.map((type) => {
            const Icon = offeringIcon(type.icon);
            const activeCount = offerings.filter((offering) => offering.offering_type === type.slug).length;
            const limitReached = type.max_per_business !== null && activeCount >= type.max_per_business;
            return (
              <button
                key={type.slug}
                type="button"
                disabled={limitReached}
                onClick={() => pickType(type)}
                className="flex w-full items-start gap-3 rounded-2xl bg-surface-container px-4 py-3.5 text-left transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-container-high disabled:opacity-50"
              >
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon size={20} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-body font-semibold text-on-surface">{type.name}</span>
                  {type.description && (
                    <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
                      {type.description}
                    </span>
                  )}
                  <span className="mt-1 block font-sans text-counter text-primary">
                    {billingLabel(type.billing_type, type.billing_interval, t)}
                  </span>
                  {limitReached && (
                    <span className="mt-1 block font-sans text-counter text-on-surface-variant">
                      {t('profile.business.offers.error.limit')}
                    </span>
                  )}
                </span>
                <ChevronRight size={18} className="mt-3 shrink-0 text-on-surface-variant" aria-hidden />
              </button>
            );
          })}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 px-5 pb-6 pt-4">
          <TextField
            label={t('profile.business.offers.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            hint={t('profile.business.offers.nameHint')}
            maxLength={96}
            disabled={createMutation.isPending}
            error={error ?? undefined}
          />
          <TextAreaField
            label={t('profile.business.offers.description')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={400}
            disabled={createMutation.isPending}
          />
          <div className="rounded-2xl bg-surface-container-high px-4 py-3">
            <p className="font-sans text-counter text-primary">{t('profile.business.offers.billing.lockedTitle')}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
              {billingLabel(selectedType.billing_type, selectedType.billing_interval, t)}
            </p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
              {t('profile.business.offers.billing.lockedHint')}
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => onSelectType(null)}
              disabled={createMutation.isPending}
              className="min-h-11 flex-1 rounded-xl bg-surface-container px-4 font-sans text-label text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              {t('profile.business.offers.back')}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              {createMutation.isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {createMutation.isPending ? t('profile.business.offers.creating') : t('profile.business.offers.create')}
            </button>
          </div>
        </form>
      )}
    </BottomSheet>
  );
}
