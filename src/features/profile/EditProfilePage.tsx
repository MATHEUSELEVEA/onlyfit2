import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation, SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n/I18nProvider';
import { COUNTRY_OPTIONS, countryName } from '@/lib/countries';
import { formatCpf, isValidCpf, normalizeCpf } from '@/lib/cpf';
import { formatCep } from '@/lib/masks';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TextField, TextAreaField, SelectField } from '@/components/ui/TextField';
import { IconChip, SectionEyebrow, SettingCard } from './components/SettingsPrimitives';
import { useMyProfile, type MyProfile } from './useMyProfile';
import { useUpdateProfile } from './useUpdateProfile';
import {
  isCpfConfigured,
  useSensitiveProfile,
  useSetCpf,
  type SensitiveProfile,
} from './useSensitiveProfile';
import {
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useSetDefaultAddress,
  useUpdateAddress,
  type AddressInput,
  type UserAddress,
} from './useAddresses';

export function EditProfilePage() {
  const { t } = useTranslation();
  const { data: profile } = useMyProfile();
  const { data: sensitive } = useSensitiveProfile();

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background md:my-6 md:overflow-hidden md:rounded-3xl md:border md:border-outline-variant/30 md:shadow-xl">
        <header className="sticky top-0 z-10 border-b border-outline-variant/30 bg-surface-container-lowest/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              to="/perfil"
              aria-label={t('editProfile.back')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-sans text-title-lg text-on-surface">{t('editProfile.title')}</h1>
              <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
                {t('editProfile.description')}
              </p>
            </div>
          </div>
        </header>

        {/* Só monta o formulário quando os dados chegam; o `key` reinicializa o
            estado local a partir das props sem precisar de useEffect de sync. */}
        {profile && sensitive ? (
          <PersonalDataForm key={profile.userId} profile={profile} sensitive={sensitive} />
        ) : (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 size={24} className="animate-spin text-primary" aria-label="Carregando" />
          </div>
        )}
      </div>
    </div>
  );
}

function PersonalDataForm({ profile, sensitive }: { profile: MyProfile; sensitive: SensitiveProfile }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id;
  const updateProfile = useUpdateProfile();
  const setCpf = useSetCpf();

  const [fullName, setFullName] = useState(profile.fullName ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [countryCode, setCountryCode] = useState(profile.countryCode ?? 'BR');
  const [language, setLanguage] = useState<LanguageCode>((profile.language as LanguageCode) ?? 'pt');
  const [phone, setPhone] = useState(sensitive.phone ?? '');
  const [cpf, setCpfValue] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const cpfLocked = isCpfConfigured(sensitive);

  async function handleSave() {
    if (!userId) return;
    setFeedback(null);

    const cpfDigits = normalizeCpf(cpf);
    if (!cpfLocked && cpfDigits.length > 0 && !isValidCpf(cpfDigits)) {
      setFeedback({ type: 'error', message: t('editProfile.cpfInvalid') });
      return;
    }

    try {
      if (!cpfLocked && cpfDigits.length > 0) {
        await setCpf.mutateAsync(cpfDigits);
      }

      await updateProfile.mutateAsync({
        userId,
        updates: {
          full_name: fullName.trim(),
          username: username.trim(),
          bio: bio.trim() || null,
          country_code: countryCode || null,
          language,
          phone: phone.trim() || null,
        },
      });

      setFeedback({ type: 'success', message: t('editProfile.saveSuccess') });
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes('nome de usuário')
          ? t('editProfile.usernameTaken')
          : error instanceof Error
            ? error.message
            : t('editProfile.saveError');
      setFeedback({ type: 'error', message });
    }
  }

  const isSaving = updateProfile.isPending || setCpf.isPending;

  return (
    <main className="space-y-8 px-4 py-6">
      <section className="space-y-3">
        <SectionEyebrow>{t('editProfile.section.personal')}</SectionEyebrow>
        <SettingCard>
          <div className="space-y-4">
            <TextField
              label={t('editProfile.fullName')}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={100}
            />
            <TextField
              label={t('editProfile.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              maxLength={30}
            />
            <TextAreaField
              label={t('editProfile.bio')}
              placeholder={t('editProfile.bioPlaceholder')}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
            />
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label={t('editProfile.country')}
                value={countryCode}
                onChange={setCountryCode}
                options={COUNTRY_OPTIONS.map((c) => ({ value: c.code, label: countryName(c.code) }))}
              />
              <SelectField
                label={t('editProfile.language')}
                value={language}
                onChange={(value) => setLanguage(value as LanguageCode)}
                options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              />
            </div>
          </div>
        </SettingCard>
      </section>

      <section className="space-y-3">
        <SectionEyebrow>{t('editProfile.section.contact')}</SectionEyebrow>
        <SettingCard>
          <TextField
            label={t('editProfile.phone')}
            placeholder={t('editProfile.phonePlaceholder')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            maxLength={20}
          />
        </SettingCard>
      </section>

      <section className="space-y-3">
        <SectionEyebrow>{t('editProfile.section.document')}</SectionEyebrow>
        <SettingCard>
          {cpfLocked ? (
            <div>
              <p className="font-sans text-body font-semibold text-on-surface">
                {t('editProfile.cpfConfiguredTail').replace(
                  '{tail}',
                  sensitive.cpfLast4 ?? normalizeCpf(sensitive.taxId ?? sensitive.cpfCnpj).slice(-4),
                )}
              </p>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                {t('editProfile.cpfLockedHint')}
              </p>
            </div>
          ) : (
            <TextField
              label={t('editProfile.cpf')}
              placeholder={t('editProfile.cpfPlaceholder')}
              value={formatCpf(normalizeCpf(cpf))}
              onChange={(e) => setCpfValue(normalizeCpf(e.target.value))}
              hint={t('editProfile.cpfUsageHint')}
              inputMode="numeric"
              maxLength={14}
            />
          )}
        </SettingCard>
      </section>

      <AddressesSection />

      {feedback && (
        <p
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={clsx(
            'font-sans text-body-sm',
            feedback.type === 'error' ? 'text-error' : 'text-primary',
          )}
        >
          {feedback.message}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {isSaving && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {isSaving ? t('editProfile.saving') : t('editProfile.save')}
      </button>
    </main>
  );
}

const emptyAddressInput: AddressInput = {
  label: '',
  recipient_name: '',
  line1: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  postal_code: '',
  country_code: 'BR',
};

function AddressesSection() {
  const { t } = useTranslation();
  const { data: addresses = [], isLoading } = useAddresses();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const deleteAddress = useDeleteAddress();
  const setDefaultAddress = useSetDefaultAddress();

  const [editing, setEditing] = useState<UserAddress | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(address: UserAddress) {
    setEditing(address);
    setFormOpen(true);
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('editProfile.addresses.deleteConfirm'))) return;
    await deleteAddress.mutateAsync(id);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionEyebrow>{t('editProfile.section.addresses')}</SectionEyebrow>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-primary/10 px-3 font-sans text-counter font-medium text-primary transition-colors active:bg-primary/20"
        >
          <Plus size={15} aria-hidden />
          {t('editProfile.addresses.add')}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
        {isLoading ? (
          <div className="flex min-h-[100px] items-center justify-center py-6">
            <Loader2 size={20} className="animate-spin text-primary" aria-label="Carregando" />
          </div>
        ) : addresses.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
            <IconChip icon={MapPin} />
            <p className="mt-3 font-sans text-body-sm text-on-surface-variant">
              {t('editProfile.addresses.empty')}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/25">
            {addresses.map((address) => (
              <AddressListItem
                key={address.id}
                address={address}
                onEdit={() => openEdit(address)}
                onDelete={() => handleDelete(address.id)}
                onSetDefault={() => setDefaultAddress.mutate(address.id)}
                settingDefault={setDefaultAddress.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <AddressFormSheet
          key={editing?.id ?? 'new'}
          address={editing}
          onClose={() => setFormOpen(false)}
          onSubmit={async (input) => {
            if (editing) {
              await updateAddress.mutateAsync({ id: editing.id, input });
            } else {
              await createAddress.mutateAsync(input);
            }
            setFormOpen(false);
          }}
        />
      )}
    </section>
  );
}

function AddressListItem({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  settingDefault,
}: {
  address: UserAddress;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  settingDefault: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-3 px-4 py-4">
      <IconChip icon={MapPin} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-sans text-body font-semibold text-on-surface">
            {address.label || `${address.line1}, ${address.number}`}
          </h3>
          {address.isDefaultShipping && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-sans text-counter text-primary">
              <Check size={12} strokeWidth={3} aria-hidden />
              {t('editProfile.addresses.default')}
            </span>
          )}
        </div>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
          {address.line1}, {address.number}
          {address.complement ? ` - ${address.complement}` : ''} · {address.city}/{address.state} ·{' '}
          {formatCep(address.postalCode)}
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="font-sans text-body-sm font-medium text-primary active:opacity-70"
          >
            {t('editProfile.addresses.edit')}
          </button>
          {!address.isDefaultShipping && (
            <button
              type="button"
              onClick={onSetDefault}
              disabled={settingDefault}
              className="font-sans text-body-sm font-medium text-primary active:opacity-70 disabled:opacity-60"
            >
              {t('editProfile.addresses.setDefault')}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 font-sans text-body-sm font-medium text-error active:opacity-70"
          >
            <Trash2 size={14} aria-hidden />
            {t('editProfile.addresses.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ViaCepResult {
  logradouro?: string;
  localidade?: string;
  uf?: string;
  bairro?: string;
  erro?: boolean;
}

async function fetchViaCep(cep: string): Promise<ViaCepResult | null> {
  const digits = cep.replace(/\D/g, '').slice(0, 8);
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await res.json();
    if (data?.erro) return { erro: true };
    return data as ViaCepResult;
  } catch {
    return null;
  }
}

function AddressFormSheet({
  address,
  onClose,
  onSubmit,
}: {
  address: UserAddress | null;
  onClose: () => void;
  onSubmit: (input: AddressInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  // Só é montado quando aberto (com `key`), então o estado inicial vem das
  // props sem necessidade de sincronizar via useEffect.
  const [values, setValues] = useState<AddressInput>(() =>
    address
      ? {
          label: address.label ?? '',
          recipient_name: address.recipientName ?? '',
          line1: address.line1,
          number: address.number,
          complement: address.complement ?? '',
          neighborhood: address.neighborhood ?? '',
          city: address.city,
          state: address.state,
          postal_code: address.postalCode,
          country_code: address.countryCode,
        }
      : emptyAddressInput,
  );
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof AddressInput>(key: K, value: AddressInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCepBlur() {
    const digits = (values.postal_code ?? '').replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepError(digits.length > 0 ? t('editProfile.addresses.cepFetchError') : null);
      return;
    }
    setCepError(null);
    setCepLoading(true);
    try {
      const data = await fetchViaCep(digits);
      if (data?.erro) {
        setCepError(t('editProfile.addresses.cepNotFound'));
      } else if (data) {
        setValues((prev) => ({
          ...prev,
          line1: data.logradouro || prev.line1,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: (data.uf || prev.state).slice(0, 2).toUpperCase(),
        }));
      }
    } catch {
      setCepError(t('editProfile.addresses.cepFetchError'));
    } finally {
      setCepLoading(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit({
        ...values,
        label: values.label?.trim() || null,
        recipient_name: values.recipient_name?.trim() || null,
        complement: values.complement?.trim() || null,
        neighborhood: values.neighborhood?.trim() || null,
        state: values.state.trim().toUpperCase().slice(0, 2),
        postal_code: values.postal_code.replace(/\D/g, ''),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    values.line1.trim().length > 0 &&
    values.number.trim().length > 0 &&
    values.city.trim().length > 0 &&
    values.state.trim().length === 2 &&
    values.postal_code.replace(/\D/g, '').length >= 8;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={address ? t('editProfile.addresses.edit') : t('editProfile.addresses.add')}
    >
      <div className="space-y-4 px-5 pb-6">
        <TextField
          label={t('editProfile.addresses.label')}
          value={values.label ?? ''}
          onChange={(e) => update('label', e.target.value)}
          maxLength={60}
        />
        <TextField
          label={t('editProfile.addresses.recipientName')}
          value={values.recipient_name ?? ''}
          onChange={(e) => update('recipient_name', e.target.value)}
          maxLength={120}
        />
        <TextField
          label={t('editProfile.addresses.postalCode')}
          value={formatCep(values.postal_code)}
          onChange={(e) => update('postal_code', e.target.value.replace(/\D/g, '').slice(0, 8))}
          onBlur={handleCepBlur}
          inputMode="numeric"
          error={cepError}
          hint={cepLoading ? t('editProfile.addresses.cepFetching') : undefined}
        />
        <TextField
          label={t('editProfile.addresses.line1')}
          value={values.line1}
          onChange={(e) => update('line1', e.target.value)}
          maxLength={200}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('editProfile.addresses.number')}
            value={values.number}
            onChange={(e) => update('number', e.target.value)}
            maxLength={20}
          />
          <TextField
            label={t('editProfile.addresses.complement')}
            value={values.complement ?? ''}
            onChange={(e) => update('complement', e.target.value)}
            maxLength={100}
          />
        </div>
        <TextField
          label={t('editProfile.addresses.neighborhood')}
          value={values.neighborhood ?? ''}
          onChange={(e) => update('neighborhood', e.target.value)}
          maxLength={100}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('editProfile.addresses.city')}
            value={values.city}
            onChange={(e) => update('city', e.target.value)}
            maxLength={100}
          />
          <TextField
            label={t('editProfile.addresses.state')}
            value={values.state}
            onChange={(e) => update('state', e.target.value.toUpperCase().slice(0, 2))}
            maxLength={2}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-full border border-outline-variant/50 px-4 font-sans text-label text-on-surface transition-colors active:bg-surface-container-low"
          >
            {t('editProfile.addresses.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 font-sans text-label text-on-primary shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {t('editProfile.addresses.save')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
