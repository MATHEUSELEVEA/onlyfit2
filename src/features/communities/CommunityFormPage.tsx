import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { Check, ImagePlus, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/I18nProvider';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { useAffinityGroups } from '@/lib/sports';
import { uploadAsset } from '@/features/studio/upload';
import { useCreateCommunity, useUpdateCommunity, type CommunityInput } from './useCommunities';
import { useCommunity } from './useCommunity';

const MAX_SPORTS = 3;

// Criar e editar compartilham a tela: com :communityId na rota é edição.
export function CommunityFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { communityId } = useParams<{ communityId: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const isEdit = Boolean(communityId);

  const { data: community, isLoading: loadingCommunity } = useCommunity(communityId);
  const createMutation = useCreateCommunity(userId);
  const updateMutation = useUpdateCommunity(communityId ?? '');
  const { groups, labelFor } = useAffinityGroups();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [sports, setSports] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedFor = useRef<string | null>(null);

  // Preenche o formulário uma única vez quando a comunidade chega (edição).
  useEffect(() => {
    if (!isEdit || !community || hydratedFor.current === community.id) return;
    hydratedFor.current = community.id;
    setName(community.name ?? '');
    setDescription(community.description ?? '');
    setRules(community.rules_text ?? '');
    setVisibility(community.visibility);
    setSports(community.sports ?? []);
    setImageUrl(community.image_url);
  }, [isEdit, community]);

  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSubmit = name.trim().length >= 3 && !isPending && !uploading;

  async function handlePickImage(file: File | undefined) {
    if (!file) return;
    setFeedback(null);
    setUploading(true);
    try {
      const url = await uploadAsset(file, `community-${Date.now()}.jpg`, file.type || 'image/jpeg', 'onlyfit-avatar');
      setImageUrl(url);
    } catch {
      setFeedback(t('communities.form.imageError'));
    } finally {
      setUploading(false);
    }
  }

  function toggleSport(key: string) {
    setSports((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= MAX_SPORTS) return current;
      return [...current, key];
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setFeedback(null);
    const input: CommunityInput = {
      name: name.trim(),
      description: description.trim(),
      rules_text: rules.trim(),
      image_url: imageUrl,
      visibility,
      sports,
    };
    try {
      if (isEdit && communityId) {
        await updateMutation.mutateAsync(input);
        navigate(`/comunidades/${communityId}`, { replace: true });
      } else {
        const created = await createMutation.mutateAsync(input);
        navigate(`/comunidades/${created.id}`, { replace: true });
      }
    } catch {
      setFeedback(t('communities.form.saveError'));
    }
  }

  if (isEdit && loadingCommunity) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-primary" aria-label={t('communities.loading')} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <PageTopBar
        title={isEdit ? t('communities.form.editTitle') : t('communities.form.createTitle')}
        backFallback="/comunidades"
      />

      <main className="mx-auto w-full max-w-[640px] space-y-6 px-4 pb-8 pt-4">
        {/* Imagem */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-container-high text-on-surface-variant transition-colors hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            aria-label={t('communities.form.imageLabel')}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus size={26} aria-hidden />
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55">
                <Loader2 size={20} className="animate-spin text-white" aria-hidden />
              </span>
            )}
          </button>
          <div className="min-w-0">
            <p className="font-sans text-body font-medium text-on-surface">{t('communities.form.imageLabel')}</p>
            <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{t('communities.form.imageHint')}</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handlePickImage(event.target.files?.[0])}
          />
        </div>

        <TextField
          label={t('communities.form.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder={t('communities.form.namePlaceholder')}
        />

        <TextAreaField
          label={t('communities.form.description')}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={600}
          placeholder={t('communities.form.descriptionPlaceholder')}
        />

        <TextAreaField
          label={t('communities.form.rules')}
          value={rules}
          onChange={(event) => setRules(event.target.value)}
          maxLength={2000}
          hint={t('communities.form.rulesHint')}
        />

        {/* Visibilidade */}
        <fieldset>
          <legend className="mb-1.5 block font-sans text-body-sm font-medium text-on-surface-variant">
            {t('communities.form.visibility')}
          </legend>
          <div className="grid grid-cols-1 gap-2">
            <VisibilityOption
              checked={visibility === 'public'}
              title={t('communities.public')}
              description={t('communities.form.publicHint')}
              onSelect={() => setVisibility('public')}
            />
            <VisibilityOption
              checked={visibility === 'private'}
              title={t('communities.private')}
              description={t('communities.form.privateHint')}
              onSelect={() => setVisibility('private')}
            />
          </div>
        </fieldset>

        {/* Categoria (grupos de afinidade) */}
        <fieldset>
          <legend className="mb-1.5 block font-sans text-body-sm font-medium text-on-surface-variant">
            {t('communities.form.category')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => {
              const active = sports.includes(group.key);
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => toggleSport(group.key)}
                  aria-pressed={active}
                  className={clsx(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    active
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest',
                  )}
                >
                  {active && <Check size={15} strokeWidth={3} aria-hidden />}
                  {labelFor(group.key)}
                </button>
              );
            })}
          </div>
        </fieldset>

        {feedback && (
          <p role="alert" className="font-sans text-body-sm text-error">
            {feedback}
          </p>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          {isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {isEdit ? t('communities.form.save') : t('communities.form.create')}
        </button>
      </main>
    </div>
  );
}

function VisibilityOption({
  checked,
  title,
  description,
  onSelect,
}: {
  checked: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={clsx(
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        checked
          ? 'border-primary bg-primary/5'
          : 'border-outline-variant/50 bg-surface-container-low hover:bg-surface-container',
      )}
    >
      <span
        className={clsx(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
          checked ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant',
        )}
      >
        {checked && <Check size={12} strokeWidth={3} aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block font-sans text-body font-medium text-on-surface">{title}</span>
        <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">{description}</span>
      </span>
    </button>
  );
}
