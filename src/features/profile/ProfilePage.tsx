import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Camera,
  CalendarCheck,
  Dumbbell,
  Gavel,
  Inbox,
  Loader2,
  LogOut,
  MessageCircle,
  Palette,
  PencilLine,
  ReceiptText,
  Salad,
  Share2,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/i18n/I18nProvider';
import { CopyHandle } from '@/components/ui/CopyHandle';
import { ProfileHero } from '@/components/ui/ProfileHero';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { AvatarEditor } from './AvatarEditor';
import { myProfileQueryKey, useMyProfile, type MyProfile } from './useMyProfile';
import { IconChip, ProfileLink, SectionEyebrow } from './components/SettingsPrimitives';
import { useUnreadCount } from '@/features/messages/useUnreadCount';
import { useRealtimeMessages } from '@/features/messages/useRealtimeMessages';

export function ProfilePage() {
  const { t } = useTranslation();
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [shareOpen, setShareOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [professionalFeedback, setProfessionalFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userId = session?.user.id;
  const profileQueryKey = myProfileQueryKey(userId);
  const { data: profile } = useMyProfile();
  // Mantém a bolinha vermelha do botão Mensagens viva mesmo parado no Perfil.
  useRealtimeMessages();
  const { data: unreadCount = 0 } = useUnreadCount();

  const metadata = session?.user.user_metadata;
  const displayName = profile?.fullName ?? metadata?.full_name ?? metadata?.name ?? 'Meu perfil';
  const avatarUrl = profile?.avatarUrl ?? metadata?.avatar_url ?? metadata?.picture ?? null;
  const initial = displayName.trim().slice(0, 1).toUpperCase() || 'M';
  // Link público do perfil (rota de creator); sem username compartilha o app.
  const shareUrl = profile?.username
    ? `${window.location.origin}/creator/${encodeURIComponent(profile.username)}`
    : window.location.origin;
  const isProfessional = profile?.isProfessional ?? false;

  const setProfessionalMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await supabase.rpc('set_professional_tools_enabled', {
        p_enabled: enabled,
      });
      if (error) throw error;
      return data as { professional_shell_enabled: boolean; is_creator: boolean };
    },
    onSuccess: (data) => {
      setProfessionalFeedback(null);
      queryClient.setQueryData<MyProfile | null>(profileQueryKey, (current) =>
        current
          ? {
              ...current,
              isProfessional: Boolean(data.professional_shell_enabled),
              isCreator: Boolean(data.is_creator),
            }
          : current,
      );
    },
    onError: () => {
      setProfessionalFeedback(t('profile.business.activationError'));
    },
  });

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
    queryClient.setQueryData<MyProfile | null>(profileQueryKey, (current) =>
      current ? { ...current, avatarUrl: publicUrl } : current,
    );
  }

  function toggleProfessional() {
    if (!userId || setProfessionalMutation.isPending) return;
    setProfessionalFeedback(null);
    setProfessionalMutation.mutate(!isProfessional);
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background md:my-6 md:overflow-hidden md:rounded-3xl md:border md:border-outline-variant/30 md:shadow-xl">
        {/* ---------- Herói: foto em moldura padronizada ---------- */}
        <header>
          <ProfileHero avatarUrl={avatarUrl} displayName={displayName} initial={initial}>
            {/* Logo + ações flutuando sobre a imagem */}
            <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <span className="font-sans text-title-lg text-white drop-shadow">OnlyFit</span>
              <div className="flex flex-col items-center gap-2">
                <Link
                  to="/mensagens"
                  aria-label={t('profile.messages.title')}
                  className="relative flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  <MessageCircle size={21} aria-hidden />
                  {unreadCount > 0 && (
                    <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff1744] px-1 font-sans text-[10px] font-bold leading-none text-white ring-2 ring-black/70">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
                <button
                  type="button"
                  aria-label={t('profile.shareProfile')}
                  onClick={() => setShareOpen(true)}
                  className="flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  <Share2 size={20} aria-hidden />
                </button>
              </div>
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
              className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <Camera size={20} aria-hidden />
            </button>
          </ProfileHero>

          {/* Identidade, abaixo da imagem */}
          <div className="flex flex-col items-center px-6 pb-6 text-center">
            <h1
              id="profile-name"
              className="max-w-full text-balance break-words font-sans text-title-lg text-on-surface"
            >
              {displayName}
            </h1>
            {profile?.username && <CopyHandle username={profile.username} className="mt-0.5" />}
            <span className="mt-2 inline-flex items-center rounded-full bg-secondary-container px-3 py-1 font-sans text-eyebrow uppercase text-on-secondary-container">
              {isProfessional ? t('profile.professional') : t('profile.member')}
            </span>
          </div>
        </header>

        {/* ---------- Configurações ---------- */}
        <section className="space-y-8 border-t border-outline-variant/30 px-6 py-8" aria-labelledby="settings-title">
          <h2 id="settings-title" className="font-sans text-title-lg text-on-surface">
            {t('profile.settingsTitle')}
          </h2>

          {/* Navegação */}
          <div className="space-y-3">
            <SectionEyebrow>{t('profile.section.navigation')}</SectionEyebrow>

            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
              <ProfileLink
                icon={Stethoscope}
                title={t('profile.health.title')}
                description={t('profile.health.description')}
                to="/perfil/saude"
              />
              <ProfileLink
                icon={Dumbbell}
                title={t('profile.training.title')}
                description={t('profile.training.description')}
                to="/meu-fit/treino"
              />
              <ProfileLink
                icon={Salad}
                title={t('profile.diet.title')}
                description={t('profile.diet.description')}
                to="/meu-fit/dieta"
              />
              <ProfileLink
                icon={Inbox}
                title={t('profile.messages.title')}
                description={t('profile.messages.description')}
                to="/mensagens"
                badge={unreadCount}
              />
              <ProfileLink
                icon={CalendarCheck}
                title={t('profile.enrollments.title')}
                description={t('profile.enrollments.description')}
                to="/meus-produtos"
              />
            </div>
          </div>

          {/* Conta */}
          <div className="space-y-3">
            <SectionEyebrow>{t('profile.section.account')}</SectionEyebrow>

            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
              <ProfileLink
                icon={PencilLine}
                title={t('profile.editProfile.title')}
                description={t('profile.editProfile.description')}
                to="/perfil/editar"
              />
              <ProfileLink
                icon={WalletCards}
                title={t('profile.payment.title')}
                description={t('profile.payment.description')}
              />
              <ProfileLink
                icon={Palette}
                title={t('profile.visual.title')}
                description={t('profile.visual.description')}
                to="/perfil/visual"
              />
              <ProfileLink
                icon={Gavel}
                title={t('profile.terms.title')}
                description={t('profile.terms.description')}
                to="/perfil/privacidade-termos"
              />
            </div>
          </div>

          {/* Profissional */}
          <div className="space-y-3">
            <SectionEyebrow>{t('profile.section.professional')}</SectionEyebrow>

            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
              <ProfessionalSwitchRow
                checked={isProfessional}
                disabled={!userId || setProfessionalMutation.isPending}
                pending={setProfessionalMutation.isPending}
                onToggle={toggleProfessional}
                icon={ShieldCheck}
                title={t('profile.becomeProfessional.title')}
                description={t('profile.business.professionalToggleDescription')}
              />
              {isProfessional && (
                <>
                  <ProfileLink
                    icon={Building2}
                    title={t('profile.business.title')}
                    description={t('profile.business.description')}
                    to="/negocios"
                  />
                  <ProfileLink
                    icon={UsersRound}
                    title={t('profile.customerManagement.title')}
                    description={t('profile.customerManagement.description')}
                  />
                  <ProfileLink
                    icon={ReceiptText}
                    title={t('profile.financialManagement.title')}
                    description={t('profile.financialManagement.description')}
                  />
                </>
              )}
            </div>
            {professionalFeedback && (
              <p role="alert" className="px-1 font-sans text-body-sm text-error">
                {professionalFeedback}
              </p>
            )}
          </div>

          {/* Sessão */}
          <div className="space-y-3">
            <SectionEyebrow>{t('profile.section.session')}</SectionEyebrow>

            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
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

function ProfessionalSwitchRow({
  icon,
  title,
  description,
  checked,
  disabled,
  pending,
  onToggle,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-h-[72px] w-full items-center gap-4 border-t border-outline-variant/25 px-4 py-4 first:border-t-0">
      <IconChip icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-body font-medium text-on-surface">{title}</span>
        <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
          {description}
        </span>
      </span>
      {pending && <Loader2 size={16} className="shrink-0 animate-spin text-on-surface-variant" aria-hidden />}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={onToggle}
        className={clsx(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60',
          checked ? 'bg-primary' : 'bg-surface-container-highest',
        )}
      >
        <span
          className={clsx(
            'absolute left-1 top-1 h-4 w-4 rounded-full bg-surface-container-lowest shadow-sm transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}
