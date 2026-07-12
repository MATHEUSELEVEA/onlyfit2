import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  BriefcaseBusiness,
  Building2,
  Camera,
  Check,
  ChevronRight,
  Gavel,
  Globe2,
  Inbox,
  LogOut,
  Plus,
  PencilLine,
  Share2,
  ShoppingBag,
  Stethoscope,
  Trophy,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { applyFontScale, readFontScale } from '@/theme/fontScale';
import { THEMES, useTheme, type ThemeId } from '@/theme/ThemeProvider';
import { SUPPORTED_LANGUAGES, useTranslation, type LanguageCode } from '@/i18n/I18nProvider';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { AvatarEditor } from './AvatarEditor';

const themeSwatches: Record<ThemeId, string> = {
  preto: '#131313',
  azul: '#5341cd',
  laranja: '#ff5e1a',
};

interface ProfileSummary {
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  isCreator: boolean;
  professionalShellEnabled: boolean;
}

export function ProfilePage() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useTranslation();
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [fontScale, setFontScale] = useState(readFontScale);
  const [shareOpen, setShareOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userId = session?.user.id;
  const profileQueryKey = ['my-profile-summary', userId];
  const { data: profile } = useQuery({
    queryKey: profileQueryKey,
    enabled: Boolean(userId),
    queryFn: async (): Promise<ProfileSummary | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, full_name, avatar_url, is_creator, professional_shell_enabled')
        .eq('id', userId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return {
        username: data.username,
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        isCreator: Boolean(data.is_creator),
        professionalShellEnabled: Boolean(data.professional_shell_enabled),
      };
    },
  });

  const professionalToolsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await supabase.rpc('set_professional_tools_enabled', {
        p_enabled: enabled,
      });
      if (error) throw error;
      return data as { professional_shell_enabled: boolean; is_creator: boolean };
    },
    onMutate: async (enabled: boolean) => {
      await queryClient.cancelQueries({ queryKey: profileQueryKey });
      const previous = queryClient.getQueryData<ProfileSummary | null>(profileQueryKey);
      queryClient.setQueryData<ProfileSummary | null>(profileQueryKey, (current) =>
        current ? { ...current, professionalShellEnabled: enabled } : current,
      );
      return { previous };
    },
    onError: (_error, _enabled, context) => {
      if (context) queryClient.setQueryData(profileQueryKey, context.previous);
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ProfileSummary | null>(profileQueryKey, (current) =>
        current
          ? {
              ...current,
              professionalShellEnabled: Boolean(data.professional_shell_enabled),
              isCreator: Boolean(data.is_creator),
            }
          : current,
      );
    },
  });

  const metadata = session?.user.user_metadata;
  const displayName = profile?.fullName ?? metadata?.full_name ?? metadata?.name ?? 'Meu perfil';
  const avatarUrl = profile?.avatarUrl ?? metadata?.avatar_url ?? metadata?.picture ?? null;
  const initial = displayName.trim().slice(0, 1).toUpperCase() || 'M';
  // Link público do perfil (rota de creator); sem username compartilha o app.
  const shareUrl = profile?.username
    ? `${window.location.origin}/creator/${encodeURIComponent(profile.username)}`
    : window.location.origin;
  const isProfessional = profile?.isCreator || profile?.professionalShellEnabled || false;

  useEffect(() => {
    applyFontScale(fontScale);
  }, [fontScale]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      // Sessão zerada => AuthenticatedApp troca para a tela de login.
    } finally {
      setSigningOut(false);
    }
  }

  function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setPickedFile(file);
    event.target.value = '';
  }

  async function handleAvatarUploaded(publicUrl: string) {
    setPickedFile(null);
    if (!userId) return;
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
    queryClient.setQueryData<ProfileSummary | null>(profileQueryKey, (current) =>
      current ? { ...current, avatarUrl: publicUrl } : current,
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background md:my-6 md:overflow-hidden md:rounded-3xl md:border md:border-outline-variant/30 md:shadow-xl">
        {/* ---------- Herói: foto preenchendo o topo ---------- */}
        <header>
          <div className="relative h-[46vh] max-h-[430px] min-h-[300px] w-full overflow-hidden">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`Foto de ${displayName}`}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-surface-tint">
                <span className="font-sans text-display text-on-primary">{initial}</span>
              </div>
            )}

            {/* Legibilidade dos controles flutuantes no topo */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent"
            />
            {/* A imagem termina em fade antes do nome */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent"
            />

            {/* Logo + ações flutuando sobre a imagem */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <span className="font-sans text-title-lg text-white drop-shadow">OnlyFit</span>
              <button
                type="button"
                aria-label={t('profile.shareProfile')}
                onClick={() => setShareOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/20 backdrop-blur-md transition-transform active:scale-95"
              >
                <Share2 size={20} aria-hidden />
              </button>
            </div>

            {/* Trocar foto de perfil */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChosen}
            />
            <button
              type="button"
              aria-label={t('profile.editAvatar')}
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/20 backdrop-blur-md transition-transform active:scale-95"
            >
              <Camera size={20} aria-hidden />
            </button>
          </div>

          {/* Identidade, abaixo da imagem */}
          <div className="flex flex-col items-center px-6 pb-6 text-center">
            <h1
              id="profile-name"
              className="max-w-full text-balance break-words font-sans text-title-lg text-on-surface"
            >
              {displayName}
            </h1>
            <span className="mt-2 inline-flex items-center rounded-full bg-secondary-container px-3 py-1 font-sans text-eyebrow uppercase text-on-secondary-container">
              {profile?.isCreator ? t('profile.professional') : t('profile.member')}
            </span>

            <Link
              to="/studio"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 font-sans text-label text-on-primary shadow-sm transition-transform active:scale-[0.98]"
            >
              <Plus size={19} aria-hidden />
              <span>{t('profile.createPost')}</span>
            </Link>
          </div>
        </header>

        {/* ---------- Configurações ---------- */}
        <section className="space-y-8 border-t border-outline-variant/30 px-6 py-8" aria-labelledby="settings-title">
          <h2 id="settings-title" className="font-sans text-title-lg text-on-surface">
            {t('profile.settingsTitle')}
          </h2>

          {/* Preferências */}
          <div className="space-y-3">
            <SectionEyebrow>{t('profile.section.preferences')}</SectionEyebrow>

            <SettingCard>
              <div className="flex items-center gap-3">
                <IconChip icon={Globe2} />
                <p className="min-w-0 flex-1 font-sans text-body font-semibold text-on-surface">
                  {t('profile.language.title')}
                </p>
                <div
                  className="flex gap-1 rounded-full bg-surface-container-low p-1"
                  role="group"
                  aria-label={t('profile.language.title')}
                >
                  {SUPPORTED_LANGUAGES.map((option) => (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => setLanguage(option.code as LanguageCode)}
                      aria-pressed={language === option.code}
                      className={clsx(
                        'min-h-8 min-w-10 rounded-full px-3 font-sans text-counter transition-colors',
                        language === option.code
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'text-on-surface-variant',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </SettingCard>

            <SettingCard>
              <label
                htmlFor="font-scale"
                className="flex items-center gap-3 font-sans text-body font-semibold text-on-surface"
              >
                <IconChip icon={PencilLine} />
                {t('profile.fontSize.title')}
              </label>
              <div className="mt-4 flex items-center gap-4 text-on-surface">
                <span className="font-sans text-counter">A</span>
                <input
                  id="font-scale"
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-container-highest accent-primary"
                  max="3"
                  min="1"
                  step="1"
                  type="range"
                  value={fontScale}
                  onChange={(event) => setFontScale(Number(event.target.value))}
                />
                <span className="font-sans text-title-lg">A</span>
              </div>
            </SettingCard>

            <SettingCard>
              <p className="font-sans text-body font-semibold text-on-surface">{t('profile.theme.title')}</p>
              <div
                className="mt-4 flex items-center gap-4"
                role="group"
                aria-label={t('profile.theme.title')}
              >
                {THEMES.map(({ id, label }) => {
                  const active = theme === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTheme(id)}
                      aria-label={label}
                      aria-pressed={active}
                      className={clsx(
                        'relative flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90',
                        active
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface'
                          : 'ring-1 ring-outline-variant/40',
                      )}
                    >
                      <span
                        className="h-8 w-8 rounded-full"
                        style={{ backgroundColor: themeSwatches[id] }}
                      />
                      {active && (
                        <Check
                          size={15}
                          className="absolute text-white"
                          strokeWidth={3}
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </SettingCard>
          </div>

          {/* Conta */}
          <div className="space-y-3">
            <SectionEyebrow>{t('profile.section.account')}</SectionEyebrow>

            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
              <ProfileLink icon={Inbox} title={t('profile.messages.title')} description={t('profile.messages.description')} />
              <ProfileLink
                icon={PencilLine}
                title={t('profile.editProfile.title')}
                description={t('profile.editProfile.description')}
              />
              <ProfileLink
                icon={WalletCards}
                title={t('profile.payment.title')}
                description={t('profile.payment.description')}
              />
              <ProfileLink
                icon={Stethoscope}
                title={t('profile.health.title')}
                description={t('profile.health.description')}
              />
            </div>
          </div>

          {/* Navegação */}
          <div className="space-y-3">
            <SectionEyebrow>{t('profile.section.navigation')}</SectionEyebrow>

            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
              <ProfileLink
                icon={ShoppingBag}
                title={t('profile.market.title')}
                description={t('profile.market.description')}
                to="/mercado"
              />
              <ProfileLink
                icon={Users}
                title={t('profile.community.title')}
                description={t('profile.community.description')}
                to="/comunidades"
              />
              <ProfileLink
                icon={Trophy}
                title={t('profile.challenges.title')}
                description={t('profile.challenges.description')}
                to="/desafios"
              />
            </div>
          </div>

          {/* Profissional */}
          <div className="space-y-3">
            <SectionEyebrow>{t('profile.section.professional')}</SectionEyebrow>

            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
              <div className="flex min-h-[72px] items-center gap-4 px-4 py-4">
                <IconChip icon={BriefcaseBusiness} />
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-body font-medium text-on-surface">
                    {t('profile.professionalTools.title')}
                  </p>
                  <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
                    {t('profile.professionalTools.description')}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isProfessional}
                  aria-label={t('profile.professionalTools.title')}
                  disabled={professionalToolsMutation.isPending}
                  onClick={() => professionalToolsMutation.mutate(!isProfessional)}
                  className={clsx(
                    'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60',
                    isProfessional ? 'bg-primary' : 'bg-surface-container-highest',
                  )}
                >
                  <span
                    className={clsx(
                      'absolute left-1 top-1 h-4 w-4 rounded-full bg-surface-container-lowest shadow-sm transition-transform',
                      isProfessional && 'translate-x-5',
                    )}
                  />
                </button>
              </div>

              {isProfessional && (
                <>
                  <ProfileLink
                    icon={Briefcase}
                    title={t('profile.management.title')}
                    description={t('profile.management.description')}
                  />
                  <ProfileLink
                    icon={Building2}
                    title={t('profile.business.title')}
                    description={t('profile.business.description')}
                  />
                </>
              )}
            </div>
          </div>

          {/* Sessão */}
          <div className="space-y-3">
            <SectionEyebrow>{t('profile.section.session')}</SectionEyebrow>

            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
              <ProfileLink icon={Gavel} title={t('profile.terms.title')} description={t('profile.terms.description')} />

              {/* Último botão da tela: sair da conta */}
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex min-h-[72px] w-full items-center gap-4 border-t border-outline-variant/25 px-4 py-4 text-left transition-colors first:border-t-0 active:bg-error-container/30 disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-container text-on-error-container">
                  <LogOut size={19} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-body font-medium text-error">
                    {signingOut ? t('profile.signOut.titleLoading') : t('profile.signOut.title')}
                  </span>
                  <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
                    {t('profile.signOut.description')}
                  </span>
                </span>
              </button>
            </div>
          </div>
        </section>
      </div>

      {pickedFile && (
        <AvatarEditor
          file={pickedFile}
          onCancel={() => setPickedFile(null)}
          onUploaded={handleAvatarUploaded}
        />
      )}
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={shareUrl}
        text={`Veja o perfil de ${displayName} no OnlyFit`}
      />
    </div>
  );
}

function SettingCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface p-4 shadow-sm">
      {children}
    </div>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-1 font-sans text-eyebrow uppercase text-on-surface-variant">{children}</h3>
  );
}

function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon size={19} aria-hidden />
    </span>
  );
}

function ProfileLink({
  icon: Icon,
  title,
  description,
  to,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  to?: string;
}) {
  const content = (
    <>
      <IconChip icon={Icon} />
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-body font-medium text-on-surface">{title}</span>
        <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
          {description}
        </span>
      </span>
      <ChevronRight size={19} className="shrink-0 text-outline" aria-hidden />
    </>
  );
  const className =
    'flex min-h-[72px] w-full items-center gap-4 border-t border-outline-variant/25 px-4 py-4 text-left transition-colors first:border-t-0 active:bg-surface-container-low';

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={className}>
      {content}
    </button>
  );
}
