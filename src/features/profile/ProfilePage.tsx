import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Camera,
  Gavel,
  Inbox,
  LogOut,
  Palette,
  Plus,
  PencilLine,
  Share2,
  ShoppingBag,
  Stethoscope,
  WalletCards,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/i18n/I18nProvider';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { AvatarEditor } from './AvatarEditor';
import { myProfileQueryKey, useMyProfile, type MyProfile } from './useMyProfile';
import { ProfileLink, SectionEyebrow } from './components/SettingsPrimitives';
import { useUnreadCount } from '@/features/messages/useUnreadCount';
import { useRealtimeMessages } from '@/features/messages/useRealtimeMessages';

export function ProfilePage() {
  const { t } = useTranslation();
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [shareOpen, setShareOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
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
              {isProfessional ? t('profile.professional') : t('profile.member')}
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

            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
              <ProfileLink
                icon={Palette}
                title={t('profile.visual.title')}
                description={t('profile.visual.description')}
                to="/perfil/visual"
              />
            </div>
          </div>

          {/* Conta */}
          <div className="space-y-3">
            <SectionEyebrow>{t('profile.section.account')}</SectionEyebrow>

            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
              <ProfileLink
                icon={Inbox}
                title={t('profile.messages.title')}
                description={t('profile.messages.description')}
                to="/mensagens"
                badge={unreadCount}
              />
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
                icon={Stethoscope}
                title={t('profile.health.title')}
                description={t('profile.health.description')}
                to="/perfil/saude"
              />
              <ProfileLink
                icon={Gavel}
                title={t('profile.terms.title')}
                description={t('profile.terms.description')}
                to="/perfil/privacidade-termos"
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
            </div>
          </div>

          {/* Profissional */}
          <div className="space-y-3">
            <SectionEyebrow>{t('profile.section.professional')}</SectionEyebrow>

            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
              <ProfileLink
                icon={Building2}
                title={t('profile.business.title')}
                description={t('profile.business.description')}
                to="/negocios"
              />
            </div>
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
