import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Check,
  ChevronRight,
  Flag,
  Heart,
  Loader2,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Play,
  Share2,
  ShoppingBag,
  Trophy,
  Users,
  UsersRound,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { formatCount, formatPrice } from '@/lib/format';
import { publicAppUrl } from '@/lib/publicUrl';
import { productTypeMeta } from '@/lib/products';
import { useAffinityGroups } from '@/lib/sports';
import { CopyHandle } from '@/components/ui/CopyHandle';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ProfileHero } from '@/components/ui/ProfileHero';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { PriceBadge } from '@/components/ui/PriceBadge';
import { SocialLinksRow } from '@/components/ui/SocialLinksRow';
import { supabase } from '@/lib/supabase';
import { useTranslation, type TranslationKey } from '@/i18n/I18nProvider';
import type { FeedAuthor } from '@/features/feed/types';
import { useAuth } from '@/contexts/AuthContext';
import { useCreatorFollowState, useToggleCreatorFollow } from './useCreatorFollow';
import { useCreatorSubscription } from './useCreatorSubscription';
import {
  useCreatorChallenges,
  useCreatorCommunities,
  useCreatorContent,
  useCreatorFollowers,
  useCreatorInfo,
  useCreatorProducts,
  type CreatorInfo,
} from './useCreatorHub';

type TabKey = 'free' | 'exclusive' | 'products' | 'challenges' | 'communities' | 'followers';
type BooleanRpcClient = {
  rpc: (
    fn: 'is_user_pair_blocked',
    args: { p_user_a: string; p_user_b: string },
  ) => PromiseLike<{ data: boolean | null; error: Error | null }>;
};

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'free', label: 'Gratuito', icon: Play },
  { key: 'exclusive', label: 'Assinantes', icon: Lock },
  { key: 'products', label: 'Produtos', icon: ShoppingBag },
  { key: 'challenges', label: 'Desafios', icon: Trophy },
  { key: 'communities', label: 'Comunidades', icon: UsersRound },
  { key: 'followers', label: 'Seguidores', icon: Users },
];

type ReportReason =
  | 'nudity_sexual'
  | 'violence'
  | 'hate_harassment'
  | 'dangerous_challenge'
  | 'self_harm_eating_disorder'
  | 'spam_scam'
  | 'other';

type ReportTarget = { type: 'user' | 'post'; id: string } | null;

const REPORT_REASONS: { key: ReportReason; labelKey: TranslationKey }[] = [
  { key: 'nudity_sexual', labelKey: 'report.reason.nudity_sexual' },
  { key: 'violence', labelKey: 'report.reason.violence' },
  { key: 'hate_harassment', labelKey: 'report.reason.hate_harassment' },
  { key: 'dangerous_challenge', labelKey: 'report.reason.dangerous_challenge' },
  { key: 'self_harm_eating_disorder', labelKey: 'report.reason.self_harm_eating_disorder' },
  { key: 'spam_scam', labelKey: 'report.reason.spam_scam' },
  { key: 'other', labelKey: 'report.reason.other' },
];

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="col-span-full px-2 py-12 text-center font-sans text-body text-on-surface-variant">
      {children}
    </p>
  );
}

function Thumb({ url, label, icon: Icon }: { url: string | null; label: string; icon: LucideIcon }) {
  if (url) {
    return <img src={url} alt={label} className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-container-high to-surface-container text-on-surface-variant">
      <Icon size={30} aria-hidden />
    </div>
  );
}

export function CreatorProfilePage() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { labelFor } = useAffinityGroups();
  const { username = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Dado inicial vindo da navegação (ex.: card do feed) só é confiável se for o
  // MESMO perfil da URL. Como a rota /creator/:username reaproveita a instância
  // entre perfis, um state antigo (voltar/avançar no histórico) mostraria o nome
  // de outra pessoa por um instante enquanto o fetch carrega. Descartamos aqui.
  const seedAuthor = (location.state as { author?: FeedAuthor } | null)?.author;
  const seed = seedAuthor && seedAuthor.username === username ? seedAuthor : undefined;
  const [tab, setTab] = useState<TabKey>('free');
  const [subscribeNotice, setSubscribeNotice] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget>(null);

  const { data } = useCreatorInfo(username);

  const creator: CreatorInfo = data ?? {
    id: seed?.id ?? '',
    username,
    displayName: seed?.displayName ?? null,
    avatarUrl: seed?.avatarUrl ?? null,
    verified: seed?.verified ?? false,
    bio: null,
    sports: [],
    subscriptionPrice: 0,
    followerCount: 0,
    subscriberCount: 0,
    socialLinks: {},
  };
  const creatorId = creator.id || null;
  const isOwnProfile = Boolean(creatorId && session?.user.id && creatorId === session.user.id);
  const initial = creator.username.slice(0, 1).toUpperCase() || '?';

  const { data: following = false } = useCreatorFollowState(creatorId);
  const { data: subscribed = false } = useCreatorSubscription(creatorId);
  const { data: isBlocked = false, isLoading: isBlockStateLoading } = useUserBlockState(creatorId);
  const { data: hasBlockedTarget = false } = useOwnUserBlockState(creatorId);
  const toggleFollow = useToggleCreatorFollow(creatorId);
  const blockMutation = useBlockUser(creatorId);
  const unblockMutation = useUnblockUser(creatorId);

  function handleSubscribeClick() {
    if (subscribed) return;
    // Checkout de assinatura roda no servidor (regra 7); aqui só sinalizamos.
    setSubscribeNotice(true);
  }

  const subPrice = creator.subscriptionPrice;
  const shareUrl = publicAppUrl(`/creator/${encodeURIComponent(creator.username)}`);
  const shareText = `Veja o perfil de ${creator.displayName ?? `@${creator.username}`} no OnlyFit`;
  const canShowProfileContent = !isBlockStateLoading && !isBlocked;

  async function handleBlock() {
    if (!creatorId) return;
    await blockMutation.mutateAsync();
    setBlockConfirmOpen(false);
    setActionsOpen(false);
    queryClient.invalidateQueries({ queryKey: ['creator-follow-state', creatorId] });
  }

  async function handleUnblock() {
    if (!creatorId) return;
    await unblockMutation.mutateAsync();
    setActionsOpen(false);
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      {/* ---------- Herói: mesma moldura do perfil próprio ---------- */}
      <ProfileHero
        avatarUrl={creator.avatarUrl}
        displayName={creator.displayName ?? creator.username}
        initial={initial}
      >
        {/* Controles flutuando sobre a imagem */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
            className="flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <ArrowLeft size={22} aria-hidden />
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label="Compartilhar perfil"
              className="flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <Share2 size={20} aria-hidden />
            </button>
            {!isOwnProfile && (
              <button
                type="button"
                onClick={() => setActionsOpen(true)}
                aria-label={t('profile.public.more')}
                className="flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <MoreHorizontal size={22} aria-hidden />
              </button>
            )}
          </div>
        </div>
      </ProfileHero>

      {/* Identidade, abaixo da imagem */}
      <div className="flex flex-col items-center px-5 text-center">
        <h1 className="flex items-center gap-1.5 text-balance break-words font-sans text-title-lg text-on-surface">
          {creator.displayName ?? `@${creator.username}`}
          {creator.verified && (
            <BadgeCheck size={18} className="shrink-0 text-primary" aria-label="Verificado" />
          )}
        </h1>
        {creator.displayName && <CopyHandle username={creator.username} className="mt-0.5" />}
        <SocialLinksRow links={creator.socialLinks} className="mt-3" />

        {creator.sports.length > 0 && (
          <span className="mt-3 inline-flex rounded-full bg-primary/10 px-3 py-1 font-sans text-eyebrow uppercase text-primary">
            {creator.sports.map(labelFor).join(' · ')}
          </span>
        )}
        {creator.bio && (
          <p className="mt-3 max-w-md font-sans text-body text-on-surface">{creator.bio}</p>
        )}

        {isBlocked && (
          <div className="mt-5 flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl border border-outline-variant/40 bg-surface-container-low px-5 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-error/10 text-error">
              <Ban size={23} aria-hidden />
            </div>
            <div className="space-y-1 text-center">
              <p className="font-sans text-title text-on-surface">{t('profile.public.blockedTitle')}</p>
              <p className="font-sans text-body-sm text-on-surface-variant">
                {t('profile.public.blockedDescription')}
              </p>
            </div>
            {hasBlockedTarget && (
              <button
                type="button"
                onClick={handleUnblock}
                disabled={unblockMutation.isPending}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full border border-outline-variant/60 px-5 font-sans text-label text-on-surface disabled:opacity-50"
              >
                {unblockMutation.isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
                {t('profile.public.unblockUser')}
              </button>
            )}
          </div>
        )}

        {canShowProfileContent && (
          <>
        {/* Stats */}
        <div className="mt-5 flex w-full max-w-xs items-stretch justify-around rounded-2xl border border-outline-variant/40 bg-surface-container-low py-3">
          <button
            type="button"
            onClick={() => setTab('followers')}
            className="flex flex-1 flex-col items-center active:opacity-70"
          >
            <span className="font-sans text-title text-on-surface">{formatCount(creator.followerCount)}</span>
            <span className="font-sans text-eyebrow uppercase text-on-surface-variant">Seguidores</span>
          </button>
          <div className="w-px bg-outline-variant/40" aria-hidden />
          <div className="flex flex-1 flex-col items-center">
            <span className="font-sans text-title text-on-surface">{formatCount(creator.subscriberCount)}</span>
            <span className="font-sans text-eyebrow uppercase text-on-surface-variant">Assinantes</span>
          </div>
        </div>

        {/* Ações */}
        <div className="mt-4 flex w-full max-w-xs gap-2">
          <button
            type="button"
            onClick={handleSubscribeClick}
            aria-pressed={subscribed}
            className={clsx(
              'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full font-sans text-label transition-all active:scale-[0.98]',
              subscribed
                ? 'border border-outline-variant/60 bg-surface-container-low text-on-surface'
                : 'bg-primary text-on-primary shadow-sm',
            )}
          >
            {subscribed ? (
              <>
                <Check size={15} strokeWidth={3} aria-hidden /> Assinado
              </>
            ) : subPrice > 0 ? (
              `Assinar · ${formatPrice(subPrice)}`
            ) : (
              'Assinar'
            )}
          </button>
          {!isOwnProfile && (
            <button
              type="button"
              onClick={() => toggleFollow.mutate(!following)}
              aria-pressed={following}
              disabled={!creatorId}
              className={clsx(
                'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full font-sans text-label transition-all active:scale-[0.98] disabled:opacity-50',
                following
                  ? 'bg-surface-container text-on-surface'
                  : 'border border-outline-variant/60 text-on-surface',
              )}
            >
              {following && <Check size={15} strokeWidth={3} aria-hidden />}
              {following ? 'Seguindo' : 'Seguir'}
            </button>
          )}
          <button
            type="button"
            aria-label="Enviar mensagem"
            disabled={!creatorId}
            onClick={() => creatorId && navigate(`/mensagens/${creatorId}`)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-outline-variant/60 text-on-surface active:bg-surface-container disabled:opacity-50"
          >
            <MessageCircle size={20} aria-hidden />
          </button>
        </div>

        {subscribeNotice && !subscribed && (
          <p className="mt-3 font-sans text-body-sm text-on-surface-variant">
            Assinaturas dentro do app chegam em breve.
          </p>
        )}
          </>
        )}
      </div>

      {canShowProfileContent && (
        <>
      {/* Abas */}
      <div className="sticky top-0 z-20 mt-6 border-b border-outline-variant/40 bg-background/95 backdrop-blur-md">
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-3">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={clsx(
                'flex min-h-[46px] shrink-0 items-center gap-1.5 border-b-2 px-3 font-sans text-label transition-colors',
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

      <div className="px-4 pt-5">
        <TabPanel
          tab={tab}
          creatorId={creatorId}
          subscribed={subscribed}
          onSubscribe={handleSubscribeClick}
          onReportPost={(postId) => setReportTarget({ type: 'post', id: postId })}
        />
      </div>
        </>
      )}

      <ProfileActionsSheet
        open={actionsOpen}
        isBlocked={isBlocked}
        hasBlockedTarget={hasBlockedTarget}
        isBusy={blockMutation.isPending || unblockMutation.isPending}
        onClose={() => setActionsOpen(false)}
        onReport={() => {
          if (!creatorId) return;
          setActionsOpen(false);
          setReportTarget({ type: 'user', id: creatorId });
        }}
        onBlock={() => {
          setActionsOpen(false);
          setBlockConfirmOpen(true);
        }}
        onUnblock={handleUnblock}
      />
      <BlockConfirmSheet
        open={blockConfirmOpen}
        isBusy={blockMutation.isPending}
        onClose={() => setBlockConfirmOpen(false)}
        onConfirm={handleBlock}
      />
      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} url={shareUrl} text={shareText} />
    </div>
  );
}

function ProfileActionsSheet({
  open,
  isBlocked,
  hasBlockedTarget,
  isBusy,
  onClose,
  onReport,
  onBlock,
  onUnblock,
}: {
  open: boolean;
  isBlocked: boolean;
  hasBlockedTarget: boolean;
  isBusy: boolean;
  onClose: () => void;
  onReport: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet open={open} onClose={onClose} title={t('profile.public.actions')}>
      <div className="flex flex-col gap-2 px-5 pb-6 pt-2">
        <SheetAction icon={Flag} label={t('profile.public.reportUser')} onClick={onReport} />
        {hasBlockedTarget ? (
          <SheetAction
            icon={Ban}
            label={t('profile.public.unblockUser')}
            onClick={onUnblock}
            disabled={isBusy}
          />
        ) : (
          <SheetAction
            icon={Ban}
            label={t('profile.public.blockUser')}
            onClick={onBlock}
            disabled={isBusy || isBlocked}
            danger
          />
        )}
      </div>
    </BottomSheet>
  );
}

function BlockConfirmSheet({
  open,
  isBusy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  isBusy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('profile.public.blockConfirmTitle')}
      description={t('profile.public.blockConfirmDescription')}
    >
      <div className="flex flex-col gap-3 px-5 pb-6 pt-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isBusy}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-error px-5 font-sans text-label text-on-error disabled:opacity-50"
        >
          {isBusy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {t('profile.public.blockConfirmAction')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-outline-variant/60 px-5 font-sans text-label text-on-surface"
        >
          {t('report.cancel')}
        </button>
      </div>
    </BottomSheet>
  );
}

function ReportSheet({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason>('spam_scam');
  const [details, setDetails] = useState('');
  const [feedback, setFeedback] = useState<'success' | 'duplicate' | 'error' | null>(null);

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const { error } = await supabase.rpc('submit_content_report', {
        p_target_type: target.type,
        p_target_id: target.id,
        p_reason: reason,
        p_description: details.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => setFeedback('success'),
    onError: (error: { code?: string; message?: string }) => {
      const duplicate = error.code === '23505' || error.message?.toLowerCase().includes('duplicate');
      setFeedback(duplicate ? 'duplicate' : 'error');
    },
  });

  function handleClose() {
    onClose();
    setFeedback(null);
    setDetails('');
  }

  return (
    <BottomSheet
      open={Boolean(target)}
      onClose={handleClose}
      title={t('report.sheetTitle')}
      description={t('report.sheetDescription')}
    >
      <div className="flex flex-col gap-4 px-5 pb-6 pt-3">
        <div className="space-y-2">
          <p className="font-sans text-label text-on-surface">{t('report.reason')}</p>
          <div className="flex flex-wrap gap-2">
            {REPORT_REASONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setReason(option.key)}
                aria-pressed={reason === option.key}
                className={clsx(
                  'rounded-full border px-3 py-2 font-sans text-body-sm transition-colors',
                  reason === option.key
                    ? 'border-primary bg-primary/12 text-primary'
                    : 'border-outline-variant/50 text-on-surface-variant',
                )}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <label className="space-y-2">
          <span className="font-sans text-label text-on-surface">{t('report.details')}</span>
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder={t('report.detailsPlaceholder')}
            rows={4}
            className="w-full resize-none rounded-2xl border border-outline-variant/50 bg-surface-container-low px-4 py-3 font-sans text-body text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary"
          />
        </label>

        {feedback && (
          <p
            className={clsx(
              'rounded-2xl px-4 py-3 font-sans text-body-sm',
              feedback === 'success' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error',
            )}
          >
            {t(feedback === 'success' ? 'report.success' : feedback === 'duplicate' ? 'report.duplicate' : 'report.error')}
          </p>
        )}

        <button
          type="button"
          onClick={() => reportMutation.mutate()}
          disabled={!target || reportMutation.isPending || feedback === 'success'}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary disabled:opacity-50"
        >
          {reportMutation.isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {t('report.submit')}
        </button>
      </div>
    </BottomSheet>
  );
}

function SheetAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex min-h-[52px] items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-low px-4 font-sans text-body transition active:scale-[0.99] disabled:opacity-50',
        danger ? 'text-error' : 'text-on-surface',
      )}
    >
      <Icon size={20} aria-hidden />
      <span>{label}</span>
      {disabled && <Loader2 size={16} className="ml-auto animate-spin" aria-hidden />}
    </button>
  );
}

function useUserBlockState(targetId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['user-block-state', session?.user.id, targetId],
    enabled: Boolean(session?.user.id && targetId && session.user.id !== targetId),
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as BooleanRpcClient).rpc('is_user_pair_blocked', {
        p_user_a: session!.user.id,
        p_user_b: targetId!,
      });
      if (error) throw error;
      return Boolean(data);
    },
  });
}

function useOwnUserBlockState(targetId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['user-own-block-state', session?.user.id, targetId],
    enabled: Boolean(session?.user.id && targetId && session.user.id !== targetId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', session!.user.id)
        .eq('blocked_id', targetId!)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    initialData: false,
  });
}

function useBlockUser(targetId: string | null) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!targetId) return;
      const { error } = await supabase.rpc('block_user', { p_target: targetId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.setQueryData(['user-block-state', session?.user.id, targetId], true);
      queryClient.setQueryData(['user-own-block-state', session?.user.id, targetId], true);
      queryClient.invalidateQueries({ queryKey: ['creator-content', targetId] });
      queryClient.invalidateQueries({ queryKey: ['creator-follow-state', targetId] });
    },
  });
}

function useUnblockUser(targetId: string | null) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!targetId) return;
      const { error } = await supabase.rpc('unblock_user', { p_target: targetId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.setQueryData(['user-block-state', session?.user.id, targetId], false);
      queryClient.setQueryData(['user-own-block-state', session?.user.id, targetId], false);
      queryClient.invalidateQueries({ queryKey: ['creator-content', targetId] });
      queryClient.invalidateQueries({ queryKey: ['creator-follow-state', targetId] });
    },
  });
}

function TabPanel({
  tab,
  creatorId,
  subscribed,
  onSubscribe,
  onReportPost,
}: {
  tab: TabKey;
  creatorId: string | null;
  subscribed: boolean;
  onSubscribe: () => void;
  onReportPost: (postId: string) => void;
}) {
  switch (tab) {
    case 'free':
      return <ContentGrid creatorId={creatorId} premium={false} onReportPost={onReportPost} />;
    case 'exclusive':
      return (
        <ContentGrid
          creatorId={creatorId}
          premium
          locked={!subscribed}
          onSubscribe={onSubscribe}
          onReportPost={onReportPost}
        />
      );
    case 'products':
      return <ProductsGrid creatorId={creatorId} />;
    case 'challenges':
      return <ChallengesList creatorId={creatorId} />;
    case 'communities':
      return <CommunitiesList creatorId={creatorId} />;
    case 'followers':
      return <FollowersList creatorId={creatorId} />;
  }
}

function ContentGrid({
  creatorId,
  premium,
  locked = false,
  onSubscribe,
  onReportPost,
}: {
  creatorId: string | null;
  premium: boolean;
  locked?: boolean;
  onSubscribe?: () => void;
  onReportPost: (postId: string) => void;
}) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useCreatorContent(creatorId);
  const items = data.filter((p) => p.isPremium === premium);

  if (locked) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-outline-variant/40 bg-surface-container-low px-6 py-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock size={26} aria-hidden />
        </div>
        <p className="font-sans text-title text-on-surface">Conteúdo exclusivo para assinantes</p>
        <p className="max-w-xs font-sans text-body text-on-surface-variant">
          {items.length > 0
            ? `Assine para desbloquear ${items.length} ${items.length === 1 ? 'publicação' : 'publicações'}.`
            : 'Assine para desbloquear os conteúdos exclusivos deste criador.'}
        </p>
        <button
          type="button"
          onClick={onSubscribe}
          className="mt-1 inline-flex min-h-[44px] items-center rounded-full bg-primary px-6 font-sans text-label text-on-primary shadow-sm active:scale-[0.98]"
        >
          Assinar
        </button>
      </div>
    );
  }

  if (isLoading) return <GridSkeleton />;
  if (items.length === 0) {
    return (
      <EmptyState>
        {premium ? 'Sem conteúdo exclusivo por aqui ainda.' : 'Sem conteúdo gratuito por aqui ainda.'}
      </EmptyState>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((p) => (
        <div key={p.id} className="relative">
          <Link
            to={`/video/${encodeURIComponent(p.id)}`}
            className="relative block aspect-square overflow-hidden rounded-lg bg-surface-container"
          >
            <Thumb url={p.thumbnailUrl} label={p.title ?? 'Conteúdo'} icon={Play} />
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
              <Heart size={12} className="text-white" fill="currentColor" aria-hidden />
              <span className="font-sans text-counter text-white">{formatCount(p.likes)}</span>
            </div>
          </Link>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onReportPost(p.id);
            }}
            aria-label={t('profile.public.reportPostAria')}
            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:scale-95"
          >
            <MoreHorizontal size={16} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

function ProductsGrid({ creatorId }: { creatorId: string | null }) {
  const { data = [], isLoading } = useCreatorProducts(creatorId);
  if (isLoading) return <GridSkeleton />;
  if (data.length === 0) return <EmptyState>Este criador ainda não publicou produtos.</EmptyState>;

  return (
    <div className="grid grid-cols-2 gap-3">
      {data.map((p) => {
        const meta = productTypeMeta(p.type);
        return (
          <div
            key={p.id}
            className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-low"
          >
            <div className="relative aspect-[4/3]">
              <Thumb url={p.thumbnailUrl} label={p.name} icon={meta.icon} />
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 font-sans text-counter text-on-surface backdrop-blur-sm">
                <meta.icon size={12} aria-hidden />
                {meta.label}
              </span>
            </div>
            <div className="flex flex-col gap-2 p-3">
              <p className="line-clamp-2 min-h-[2.4em] font-sans text-body text-on-surface">{p.name}</p>
              <div className="flex items-center justify-between">
                <PriceBadge price={p.price} />
                <ChevronRight size={16} className="text-on-surface-variant" aria-hidden />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Card largo com capa, título e descrição — padrão do content_viewer, com
// respiro maior. Serve para desafios e comunidades.
function MediaCard({
  cover,
  icon,
  title,
  description,
  meta,
  action,
}: {
  cover: string | null;
  icon: LucideIcon;
  title: string;
  description: string | null;
  meta: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-outline-variant/40 bg-surface-container-low">
      <div className="relative aspect-[16/9]">
        <Thumb url={cover} label={title} icon={icon} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"
        />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="font-sans text-title text-on-surface">{title}</h3>
          {description && (
            <p className="line-clamp-2 font-sans text-body text-on-surface-variant">{description}</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="font-sans text-body-sm text-on-surface-variant">{meta}</span>
          {action}
        </div>
      </div>
    </div>
  );
}

function ChallengesList({ creatorId }: { creatorId: string | null }) {
  const { data = [], isLoading } = useCreatorChallenges(creatorId);
  if (isLoading) return <CardSkeleton />;
  if (data.length === 0) return <EmptyState>Nenhum desafio ativo no momento.</EmptyState>;

  return (
    <div className="flex flex-col gap-5">
      {data.map((c) => (
        <MediaCard
          key={c.id}
          cover={c.coverImageUrl}
          icon={Trophy}
          title={c.name}
          description={c.description}
          meta={`${formatCount(c.participantCount)} participantes`}
          action={
            <Link
              to={`/desafios/${c.id}`}
              className="inline-flex min-h-[36px] items-center rounded-full bg-primary px-5 font-sans text-label text-on-primary active:scale-[0.98]"
            >
              Participar
            </Link>
          }
        />
      ))}
    </div>
  );
}

function CommunitiesList({ creatorId }: { creatorId: string | null }) {
  const { data = [], isLoading } = useCreatorCommunities(creatorId);
  if (isLoading) return <CardSkeleton />;
  if (data.length === 0) return <EmptyState>Este criador ainda não tem comunidades.</EmptyState>;

  return (
    <div className="flex flex-col gap-5">
      {data.map((c) => (
        <MediaCard
          key={c.id}
          cover={null}
          icon={UsersRound}
          title={c.name}
          description={c.description}
          meta={`${formatCount(c.memberCount)} membros${c.visibility === 'private' ? ' · Privada' : ''}`}
          action={
            <Link
              to={`/comunidades/${c.id}`}
              className="inline-flex min-h-[36px] items-center rounded-full bg-primary px-5 font-sans text-label text-on-primary active:scale-[0.98]"
            >
              {c.visibility === 'private' ? 'Solicitar entrada' : 'Entrar'}
            </Link>
          }
        />
      ))}
    </div>
  );
}

function FollowersList({ creatorId }: { creatorId: string | null }) {
  const { data = [], isLoading } = useCreatorFollowers(creatorId);
  if (isLoading) return <GridSkeleton />;
  if (data.length === 0) return <EmptyState>Ainda sem seguidores por aqui.</EmptyState>;

  return (
    <div className="flex flex-col divide-y divide-outline-variant/30">
      {data.map((f) => {
        const row = (
          <div className="flex items-center gap-3 py-2.5">
            {f.avatarUrl ? (
              <img src={f.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-high font-sans text-body text-on-surface">
                {(f.username ?? f.displayName ?? '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {f.displayName && (
                <p className="truncate font-sans text-body text-on-surface">{f.displayName}</p>
              )}
              {f.username && (
                <span className="truncate font-sans text-counter text-on-surface-variant">@{f.username}</span>
              )}
            </div>
            {f.username && <ChevronRight size={16} className="text-on-surface-variant" aria-hidden />}
          </div>
        );
        return f.username ? (
          <Link key={f.id} to={`/creator/${encodeURIComponent(f.username)}`}>
            {row}
          </Link>
        ) : (
          <div key={f.id}>{row}</div>
        );
      })}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="aspect-square animate-pulse rounded-lg bg-surface-container" />
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-3xl bg-surface-container" />
      ))}
    </div>
  );
}
