import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  Bell,
  HeartPulse,
  LayoutGrid,
  Menu,
  MessageCircle,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { publicAppOrigin, publicAppUrl } from '@/lib/publicUrl';
import { useTranslation } from '@/i18n/I18nProvider';
import { CopyHandle } from '@/components/ui/CopyHandle';
import { ProfileHero } from '@/components/ui/ProfileHero';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { SocialLinksRow } from '@/components/ui/SocialLinksRow';
import { AvatarEditor } from './AvatarEditor';
import { myProfileQueryKey, useMyProfile, type MyProfile } from './useMyProfile';
import { MyPostsTab } from './MyPostsTab';
import { useUnreadCount } from '@/features/messages/useUnreadCount';
import { useRealtimeMessages } from '@/features/messages/useRealtimeMessages';
import { useRealtimeNotifications, useUnreadNotificationsCount } from '@/features/notifications/useNotifications';

type TabKey = 'feed' | 'health';

export function ProfilePage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [shareOpen, setShareOpen] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [tab, setTab] = useState<TabKey>('feed');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userId = session?.user.id;
  const profileQueryKey = myProfileQueryKey(userId);
  const { data: profile } = useMyProfile();
  // Mantém a bolinha vermelha do botão Mensagens viva mesmo parado no Perfil.
  useRealtimeMessages();
  useRealtimeNotifications();
  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: unreadNotifications = 0 } = useUnreadNotificationsCount();

  const metadata = session?.user.user_metadata;
  const displayName = profile?.fullName ?? metadata?.full_name ?? metadata?.name ?? 'Meu perfil';
  const avatarUrl = profile?.avatarUrl ?? metadata?.avatar_url ?? metadata?.picture ?? null;
  const initial = displayName.trim().slice(0, 1).toUpperCase() || 'M';
  // Link público do perfil (rota de creator); sem username compartilha o app.
  const shareUrl = profile?.username
    ? publicAppUrl(`/creator/${encodeURIComponent(profile.username)}`)
    : publicAppOrigin();
  const isProfessional = profile?.isProfessional ?? false;

  const tabs: { key: TabKey; label: string; icon: LucideIcon }[] = [
    { key: 'feed', label: t('profile.tabs.feed'), icon: LayoutGrid },
    { key: 'health', label: t('profile.tabs.health'), icon: HeartPulse },
  ];

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
    <div className="scrollbar-gutter-stable h-full overflow-y-auto bg-background pb-10">
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background md:my-6 md:overflow-hidden md:rounded-3xl md:border md:border-outline-variant/30 md:shadow-xl">
        {/* ---------- Herói: foto em moldura padronizada ---------- */}
        <header>
          <ProfileHero avatarUrl={avatarUrl} displayName={displayName} initial={initial}>
            {/* Logo + ações flutuando sobre a imagem */}
            <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <span className="font-sans text-title-lg text-white drop-shadow">OnlyFit</span>
              <div className="flex flex-col items-center gap-2">
                <Link
                  to="/perfil/menu"
                  aria-label={t('profile.menu.open')}
                  className="flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  <Menu size={22} aria-hidden />
                </Link>
                <Link
                  to="/perfil/atualizacoes"
                  aria-label="Atualizações"
                  className="relative flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  <Bell size={21} aria-hidden />
                  {unreadNotifications > 0 && (
                    <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-sans text-counter leading-none text-on-primary ring-2 ring-background">
                      {unreadNotifications > 99 ? '99+' : unreadNotifications}
                    </span>
                  )}
                </Link>
                <Link
                  to="/mensagens"
                  aria-label={t('profile.messages.title')}
                  className="relative flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  <MessageCircle size={21} aria-hidden />
                  {unreadCount > 0 && (
                    <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 font-sans text-counter leading-none text-on-error ring-2 ring-background">
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
            {profile?.socialLinks && <SocialLinksRow links={profile.socialLinks} className="mt-3" />}
            <span className="mt-2 inline-flex items-center rounded-full bg-secondary-container px-3 py-1 font-sans text-eyebrow uppercase text-on-secondary-container">
              {isProfessional ? t('profile.professional') : t('profile.member')}
            </span>
          </div>
        </header>

        {/* ---------- Abas: Feed e Saúde ---------- */}
        <div className="sticky top-0 z-20 border-b border-outline-variant/40 bg-background/95 backdrop-blur-md">
          <div className="flex px-3" role="tablist" aria-label={t('profile.tabs.label')}>
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={clsx(
                  'flex min-h-[46px] flex-1 items-center justify-center gap-1.5 border-b-2 px-3 font-sans text-label transition-colors',
                  tab === key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-on-surface-variant',
                )}
              >
                <Icon size={16} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-5">
          {tab === 'feed' ? <MyPostsTab username={profile?.username ?? null} /> : <HealthTab />}
        </div>
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

// Placeholder da aba Saúde — o dashboard entra numa fase futura.
function HealthTab() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-outline-variant/40 bg-surface-container-low px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <HeartPulse size={26} aria-hidden />
      </div>
      <p className="font-sans text-title text-on-surface">{t('profile.healthTab.title')}</p>
      <p className="max-w-xs font-sans text-body text-on-surface-variant">
        {t('profile.healthTab.description')}
      </p>
      <Link
        to="/perfil/saude"
        className="mt-1 inline-flex min-h-[44px] items-center rounded-full border border-outline-variant/60 px-6 font-sans text-label text-on-surface active:bg-surface-container"
      >
        {t('profile.healthTab.openHealth')}
      </Link>
    </div>
  );
}
