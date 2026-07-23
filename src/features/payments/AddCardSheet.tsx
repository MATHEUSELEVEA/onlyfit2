import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TextField } from '@/components/ui/TextField';
import { useTranslation } from '@/i18n/I18nProvider';
import { formatCep } from '@/lib/masks';
import { formatCpf, isValidCpf, normalizeCpf } from '@/lib/cpf';
import { useSensitiveProfile } from '@/features/profile/useSensitiveProfile';
import { useAddPaymentCard } from './usePaymentCards';

interface AddCardSheetProps {
  open: boolean;
  onClose: () => void;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function groupCardNumber(value: string): string {
  return digitsOnly(value).slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

export function AddCardSheet({ open, onClose }: AddCardSheetProps) {
  const { t } = useTranslation();
  const { data: sensitive } = useSensitiveProfile();
  const addCard = useAddPaymentCard();

  const [holderName, setHolderName] = useState('');
  const [number, setNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [ccv, setCcv] = useState('');
  const [cpf, setCpf] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);

  const profileCpf = normalizeCpf(sensitive?.taxId ?? sensitive?.cpfCnpj ?? '');
  const effectiveCpf = normalizeCpf(cpf) || profileCpf;
  const cpfLocked = profileCpf.length === 11;

  const cardDigits = digitsOnly(number);
  const canSubmit = useMemo(
    () =>
      holderName.trim().length >= 2 &&
      cardDigits.length >= 13 &&
      Number(expiryMonth) >= 1 &&
      Number(expiryMonth) <= 12 &&
      expiryYear.length === 4 &&
      ccv.length >= 3 &&
      postalCode.length === 8 &&
      addressNumber.trim().length > 0 &&
      isValidCpf(effectiveCpf),
    [holderName, cardDigits, expiryMonth, expiryYear, ccv, postalCode, addressNumber, effectiveCpf],
  );

  function reset() {
    setHolderName('');
    setNumber('');
    setExpiryMonth('');
    setExpiryYear('');
    setCcv('');
    setCpf('');
    setPostalCode('');
    setAddressNumber('');
    setNickname('');
    setError(null);
  }

  function handleClose() {
    if (addCard.isPending) return;
    reset();
    onClose();
  }

  function handleSubmit() {
    setError(null);
    if (!canSubmit) {
      setError(t('payments.card.form.invalid'));
      return;
    }
    addCard.mutate(
      {
        card: {
          holderName: holderName.trim(),
          number: cardDigits,
          expiryMonth: expiryMonth.padStart(2, '0'),
          expiryYear,
          ccv,
        },
        holderInfo: {
          cpfCnpj: effectiveCpf,
          postalCode,
          addressNumber: addressNumber.trim(),
        },
        nickname: nickname.trim() || undefined,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
        onError: (mutationError) => {
          setError(mutationError instanceof Error ? mutationError.message : t('payments.card.form.invalid'));
        },
      },
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title={t('payments.card.form.title')}
      description={t('payments.card.form.subtitle')}
      panelClassName="h-[92%]"
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-2">
        <TextField
          label={t('payments.card.form.holderName')}
          value={holderName}
          onChange={(event) => setHolderName(event.target.value)}
          autoComplete="cc-name"
          maxLength={80}
        />
        <TextField
          label={t('payments.card.form.number')}
          value={groupCardNumber(number)}
          onChange={(event) => setNumber(digitsOnly(event.target.value).slice(0, 16))}
          inputMode="numeric"
          autoComplete="cc-number"
          maxLength={19}
          placeholder="0000 0000 0000 0000"
        />
        <div className="grid grid-cols-3 gap-3">
          <TextField
            label={t('payments.card.form.expiryMonth')}
            value={expiryMonth}
            onChange={(event) => setExpiryMonth(digitsOnly(event.target.value).slice(0, 2))}
            inputMode="numeric"
            maxLength={2}
            placeholder="MM"
          />
          <TextField
            label={t('payments.card.form.expiryYear')}
            value={expiryYear}
            onChange={(event) => setExpiryYear(digitsOnly(event.target.value).slice(0, 4))}
            inputMode="numeric"
            maxLength={4}
            placeholder="AAAA"
          />
          <TextField
            label={t('payments.card.form.ccv')}
            value={ccv}
            onChange={(event) => setCcv(digitsOnly(event.target.value).slice(0, 4))}
            inputMode="numeric"
            autoComplete="cc-csc"
            maxLength={4}
            placeholder="CVV"
          />
        </div>
        <TextField
          label={t('payments.card.form.cpf')}
          value={cpfLocked ? formatCpf(profileCpf) : formatCpf(normalizeCpf(cpf))}
          onChange={(event) => setCpf(normalizeCpf(event.target.value))}
          disabled={cpfLocked}
          inputMode="numeric"
          maxLength={14}
          hint={cpfLocked ? t('payments.card.form.cpfLocked') : undefined}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('payments.card.form.postalCode')}
            value={formatCep(postalCode)}
            onChange={(event) => setPostalCode(digitsOnly(event.target.value).slice(0, 8))}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={9}
            placeholder="00000-000"
          />
          <TextField
            label={t('payments.card.form.addressNumber')}
            value={addressNumber}
            onChange={(event) => setAddressNumber(event.target.value.slice(0, 12))}
            inputMode="numeric"
            maxLength={12}
          />
        </div>
        <TextField
          label={t('payments.card.form.nickname')}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={40}
          hint={t('payments.card.form.nicknameHint')}
        />

        <p className="font-sans text-body-sm text-on-surface-variant">{t('payments.card.form.security')}</p>

        {error && (
          <p role="alert" className="font-sans text-body-sm text-error">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || addCard.isPending}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {addCard.isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {addCard.isPending ? t('payments.card.form.saving') : t('payments.card.form.submit')}
        </button>
      </div>
    </BottomSheet>
  );
}
