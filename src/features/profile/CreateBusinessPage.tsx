import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Camera, Check, Loader2, UserRound } from 'lucide-react';
import { clsx } from 'clsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/I18nProvider';
import { supabase } from '@/lib/supabase';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { isCpfConfigured, useSensitiveProfile } from './useSensitiveProfile';

type BusinessType = 'independent' | 'company';

interface CreatedBusiness {
  id: string;
}

const specialties = [
  { value: '', labelKey: 'profile.business.create.specialtyNone', council: '' },
  { value: 'medicine', labelKey: 'profile.business.create.specialtyMedicine', council: 'CRM' },
  { value: 'nutrition', labelKey: 'profile.business.create.specialtyNutrition', council: 'CRN' },
  { value: 'physiotherapy', labelKey: 'profile.business.create.specialtyPhysiotherapy', council: 'CREFITO' },
  { value: 'physical_education', labelKey: 'profile.business.create.specialtyPhysicalEducation', council: 'CREF' },
  { value: 'psychology', labelKey: 'profile.business.create.specialtyPsychology', council: 'CRP' },
  { value: 'nursing', labelKey: 'profile.business.create.specialtyNursing', council: 'COREN' },
  { value: 'dentistry', labelKey: 'profile.business.create.specialtyDentistry', council: 'CRO' },
  { value: 'speech_therapy', labelKey: 'profile.business.create.specialtySpeechTherapy', council: 'CREFONO' },
  { value: 'occupational_therapy', labelKey: 'profile.business.create.specialtyOccupationalTherapy', council: 'CREFITO' },
  { value: 'pharmacy', labelKey: 'profile.business.create.specialtyPharmacy', council: 'CRF' },
  { value: 'biomedicine', labelKey: 'profile.business.create.specialtyBiomedicine', council: 'CRBM' },
] as const;

type SpecialtyLabelKey = (typeof specialties)[number]['labelKey'];

interface FormErrors {
  name?: string;
  cnpj?: string;
  niche?: string;
  website?: string;
  logo?: string;
  submit?: string;
}

export function CreateBusinessPage() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: sensitiveProfile, isLoading: isLoadingProfile } = useSensitiveProfile();

  const [businessType, setBusinessType] = useState<BusinessType>('independent');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [niche, setNiche] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [registration, setRegistration] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  useEffect(() => () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  const selectedSpecialty = specialties.find((item) => item.value === specialty);
  const hasCpf = isCpfConfigured(sensitiveProfile);

  const createMutation = useMutation({
    mutationFn: async () => {
      const userId = session?.user.id;
      if (!userId) throw new Error('not_authenticated');

      let logoUrl: string | null = null;
      let uploadedPath: string | null = null;
      if (logo) {
        const extension = logo.name.split('.').pop()?.toLowerCase() || 'jpg';
        uploadedPath = `${userId}/logos/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('business-media')
          .upload(uploadedPath, logo, { contentType: logo.type, upsert: false });
        if (uploadError) throw new Error('logo_upload_failed');
        logoUrl = supabase.storage.from('business-media').getPublicUrl(uploadedPath).data.publicUrl;
      }

      const { data, error } = await supabase.rpc('create_mobile_business', {
        p_name: name.trim(),
        p_business_type: businessType,
        p_logo_url: logoUrl,
        p_description: description.trim() || null,
        p_website_url: website.trim() || null,
        p_cnpj: businessType === 'company' ? onlyDigits(cnpj) : null,
        p_market_niche: businessType === 'company' ? niche.trim() : null,
        p_professional_specialty: businessType === 'independent' ? specialty || null : null,
        p_professional_registration:
          businessType === 'independent' ? registration.trim() || null : null,
      });

      if (error) {
        if (uploadedPath) await supabase.storage.from('business-media').remove([uploadedPath]);
        throw error;
      }
      return data as CreatedBusiness;
    },
    onSuccess: async (business) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-owned-businesses'] });
      navigate(`/negocios/${business.id}`, { replace: true });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : '';
      setErrors((current) => ({
        ...current,
        submit:
          message.includes('cpf_required')
            ? t('profile.business.create.cpfRequired')
            : message.includes('logo_upload_failed')
              ? t('profile.business.create.logoUploadError')
              : t('profile.business.create.submitError'),
      }));
    },
  });

  function validate() {
    const next: FormErrors = {};
    if (name.trim().length < 3) next.name = t('profile.business.create.nameError');
    if (website.trim() && !isValidHttpUrl(website.trim())) {
      next.website = t('profile.business.create.websiteError');
    }
    if (businessType === 'company') {
      if (!isValidCnpj(cnpj)) next.cnpj = t('profile.business.create.cnpjError');
      if (niche.trim().length < 2) next.niche = t('profile.business.create.nicheError');
    }
    if (businessType === 'independent' && !hasCpf) {
      next.submit = t('profile.business.create.cpfRequired');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (validate()) createMutation.mutate();
  }

  function selectLogo(file: File | undefined) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setLogo(null);
      setErrors((current) => ({ ...current, logo: t('profile.business.create.logoError') }));
      return;
    }
    setLogo(file);
    setErrors((current) => ({ ...current, logo: undefined }));
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto min-h-full w-full max-w-[640px] bg-background">
        <header className="sticky top-0 z-10 border-b border-outline-variant/20 bg-background/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              to="/negocios"
              aria-label={t('profile.business.create.back')}
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <div>
              <h1 className="font-sans text-title-lg text-on-surface">{t('profile.business.create.title')}</h1>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                {t('profile.business.create.description')}
              </p>
            </div>
          </div>
        </header>

        <main className="px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
          <form onSubmit={submit} noValidate className="space-y-6">
            <fieldset>
              <legend className="font-sans text-body font-semibold text-on-surface">
                {t('profile.business.create.type')}
              </legend>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                {t('profile.business.create.typeHint')}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup">
                <TypeOption
                  active={businessType === 'independent'}
                  icon={UserRound}
                  label={t('profile.business.create.independent')}
                  description={t('profile.business.create.independentHint')}
                  onClick={() => {
                    setBusinessType('independent');
                    setErrors({});
                  }}
                />
                <TypeOption
                  active={businessType === 'company'}
                  icon={Building2}
                  label={t('profile.business.create.company')}
                  description={t('profile.business.create.companyHint')}
                  onClick={() => {
                    setBusinessType('company');
                    setErrors({});
                  }}
                />
              </div>
            </fieldset>

            {businessType === 'independent' && !isLoadingProfile && !hasCpf && (
              <div className="rounded-2xl bg-error-container p-4 text-on-error-container" role="alert">
                <p className="font-sans text-body font-semibold">{t('profile.business.create.cpfRequiredTitle')}</p>
                <p className="mt-1 font-sans text-body-sm">{t('profile.business.create.cpfRequired')}</p>
                <Link
                  to="/perfil/editar"
                  className="mt-3 inline-flex min-h-11 items-center font-sans text-label underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error"
                >
                  {t('profile.business.create.registerCpf')}
                </Link>
              </div>
            )}

            <section className="space-y-4" aria-labelledby="business-data-title">
              <h2 id="business-data-title" className="font-sans text-title text-on-surface">
                {t('profile.business.create.dataTitle')}
              </h2>

              <label className="block">
                <span className="block font-sans text-body-sm font-medium text-on-surface-variant">
                  {t('profile.business.create.logo')}
                </span>
                <span className="mt-2 flex min-h-20 cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-outline-variant/60 bg-surface-container-low p-3 transition-colors hover:bg-surface-container focus-within:ring-2 focus-within:ring-primary">
                  {logoPreview ? (
                    <img src={logoPreview} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant">
                      <Camera size={22} aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block font-sans text-body font-semibold text-on-surface">
                      {logo ? logo.name : t('profile.business.create.logoAction')}
                    </span>
                    <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
                      {t('profile.business.create.logoHint')}
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => selectLogo(event.target.files?.[0])}
                  />
                </span>
                {errors.logo && <span className="mt-1.5 block font-sans text-body-sm text-error">{errors.logo}</span>}
              </label>

              <TextField
                label={t('profile.business.create.name')}
                value={name}
                maxLength={96}
                autoComplete="organization"
                error={errors.name}
                onChange={(event) => setName(event.target.value)}
              />
              <TextAreaField
                label={t('profile.business.create.businessDescription')}
                value={description}
                maxLength={600}
                onChange={(event) => setDescription(event.target.value)}
              />
              <TextField
                label={t('profile.business.create.website')}
                type="url"
                inputMode="url"
                value={website}
                placeholder="https://"
                error={errors.website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </section>

            {businessType === 'independent' ? (
              <section className="space-y-4" aria-labelledby="professional-data-title">
                <div>
                  <h2 id="professional-data-title" className="font-sans text-title text-on-surface">
                    {t('profile.business.create.professionalTitle')}
                  </h2>
                  <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                    {t('profile.business.create.professionalHint')}
                  </p>
                </div>
                <label className="block space-y-1.5">
                  <span className="font-sans text-body-sm font-medium text-on-surface-variant">
                    {t('profile.business.create.specialty')}
                  </span>
                  <select
                    value={specialty}
                    onChange={(event) => {
                      setSpecialty(event.target.value);
                      setRegistration('');
                    }}
                    className="min-h-11 w-full appearance-none rounded-xl border border-outline-variant/50 bg-surface-container-low px-3.5 font-sans text-body text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {specialties.map((item) => (
                      <option key={item.value} value={item.value}>
                        {t(item.labelKey as SpecialtyLabelKey)}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedSpecialty?.council && (
                  <TextField
                    label={`${t('profile.business.create.registration')} ${selectedSpecialty.council}`}
                    value={registration}
                    maxLength={32}
                    hint={t('profile.business.create.registrationHint')}
                    onChange={(event) => setRegistration(event.target.value)}
                  />
                )}
              </section>
            ) : (
              <section className="space-y-4" aria-labelledby="company-data-title">
                <h2 id="company-data-title" className="font-sans text-title text-on-surface">
                  {t('profile.business.create.companyDataTitle')}
                </h2>
                <TextField
                  label={t('profile.business.create.cnpj')}
                  value={formatCnpj(cnpj)}
                  inputMode="numeric"
                  maxLength={18}
                  placeholder="00.000.000/0000-00"
                  error={errors.cnpj}
                  onChange={(event) => setCnpj(onlyDigits(event.target.value).slice(0, 14))}
                />
                <TextField
                  label={t('profile.business.create.niche')}
                  value={niche}
                  maxLength={80}
                  error={errors.niche}
                  hint={t('profile.business.create.nicheHint')}
                  onChange={(event) => setNiche(event.target.value)}
                />
              </section>
            )}

            <section className="rounded-2xl bg-surface-container-low p-4" aria-labelledby="verification-title">
              <div className="flex gap-3">
                <Check size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                <div>
                  <h2 id="verification-title" className="font-sans text-body font-semibold text-on-surface">
                    {t('profile.business.create.verificationTitle')}
                  </h2>
                  <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                    {t('profile.business.create.verificationHint')}
                  </p>
                </div>
              </div>
            </section>

            {errors.submit && <p role="alert" className="font-sans text-body-sm text-error">{errors.submit}</p>}

            <button
              type="submit"
              disabled={createMutation.isPending || (businessType === 'independent' && !hasCpf)}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMutation.isPending && <Loader2 size={18} className="animate-spin" aria-hidden />}
              {createMutation.isPending ? t('profile.business.create.creating') : t('profile.business.create.action')}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

function TypeOption({
  active,
  icon: Icon,
  label,
  description,
  onClick,
}: {
  active: boolean;
  icon: typeof UserRound;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={clsx(
        'min-h-28 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active
          ? 'border-primary bg-primary/10 text-on-surface'
          : 'border-outline-variant/40 bg-surface text-on-surface hover:bg-surface-container-low',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <Icon size={21} className={active ? 'text-primary' : 'text-on-surface-variant'} aria-hidden />
        {active && <Check size={17} className="text-primary" strokeWidth={3} aria-hidden />}
      </span>
      <span className="mt-3 block font-sans text-body font-semibold">{label}</span>
      <span className="mt-1 block font-sans text-body-sm text-on-surface-variant">{description}</span>
    </button>
  );
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function formatCnpj(value: string) {
  return onlyDigits(value)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidCnpj(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const calculateDigit = (base: string, weights: number[]) => {
    const total = base.split('').reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculateDigit(digits.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}
