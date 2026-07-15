import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronRight,
  Heart,
  Lock,
  MessageCircle,
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
import { productTypeMeta } from '@/lib/products';
import { useAffinityGroups } from '@/lib/sports';
import { CopyHandle } from '@/components/ui/CopyHandle';
import { ProfileHero } from '@/components/ui/ProfileHero';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { PriceBadge } from '@/components/ui/PriceBadge';
import type { FeedAuthor } from '@/features/feed/types';
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

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'free', label: 'Gratuito', icon: Play },
  { key: 'exclusive', label: 'Assinantes', icon: Lock },
  { key: 'products', label: 'Produtos', icon: ShoppingBag },
  { key: 'challenges', label: 'Desafios', icon: Trophy },
  { key: 'communities', label: 'Comunidades', icon: UsersRound },
  { key: 'followers', label: 'Seguidores', icon: Users },
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
  const { labelFor } = useAffinityGroups();
  const { username = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const seed = (location.state as { author?: FeedAuthor } | null)?.author;
  const [tab, setTab] = useState<TabKey>('free');
  const [subscribeNotice, setSubscribeNotice] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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
  };
  const creatorId = creator.id || null;
  const initial = creator.username.slice(0, 1).toUpperCase() || '?';

  const { data: following = false } = useCreatorFollowState(creatorId);
  const { data: subscribed = false } = useCreatorSubscription(creatorId);
  const toggleFollow = useToggleCreatorFollow(creatorId);

  function handleSubscribeClick() {
    if (subscribed) return;
    // Checkout de assinatura roda no servidor (regra 7); aqui só sinalizamos.
    setSubscribeNotice(true);
  }

  const subPrice = creator.subscriptionPrice;
  const shareUrl = `${window.location.origin}/creator/${encodeURIComponent(creator.username)}`;
  const shareText = `Veja o perfil de ${creator.displayName ?? `@${creator.username}`} no OnlyFit`;

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
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            aria-label="Compartilhar perfil"
            className="flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <Share2 size={20} aria-hidden />
          </button>
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

        {creator.sports.length > 0 && (
          <span className="mt-3 inline-flex rounded-full bg-primary/10 px-3 py-1 font-sans text-eyebrow uppercase text-primary">
            {creator.sports.map(labelFor).join(' · ')}
          </span>
        )}
        {creator.bio && (
          <p className="mt-3 max-w-md font-sans text-body text-on-surface">{creator.bio}</p>
        )}

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
      </div>

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
        <TabPanel tab={tab} creatorId={creatorId} subscribed={subscribed} onSubscribe={handleSubscribeClick} />
      </div>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} url={shareUrl} text={shareText} />
    </div>
  );
}

function TabPanel({
  tab,
  creatorId,
  subscribed,
  onSubscribe,
}: {
  tab: TabKey;
  creatorId: string | null;
  subscribed: boolean;
  onSubscribe: () => void;
}) {
  switch (tab) {
    case 'free':
      return <ContentGrid creatorId={creatorId} premium={false} />;
    case 'exclusive':
      return <ContentGrid creatorId={creatorId} premium locked={!subscribed} onSubscribe={onSubscribe} />;
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
}: {
  creatorId: string | null;
  premium: boolean;
  locked?: boolean;
  onSubscribe?: () => void;
}) {
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
        <Link
          key={p.id}
          to={`/video/${encodeURIComponent(p.id)}`}
          className="relative aspect-square overflow-hidden rounded-lg bg-surface-container"
        >
          <Thumb url={p.thumbnailUrl} label={p.title ?? 'Conteúdo'} icon={Play} />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
            <Heart size={12} className="text-white" fill="currentColor" aria-hidden />
            <span className="font-sans text-counter text-white">{formatCount(p.likes)}</span>
          </div>
        </Link>
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
            <button
              type="button"
              className="inline-flex min-h-[36px] items-center rounded-full bg-primary px-5 font-sans text-label text-on-primary active:scale-[0.98]"
            >
              Participar
            </button>
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
            <button
              type="button"
              className="inline-flex min-h-[36px] items-center rounded-full bg-primary px-5 font-sans text-label text-on-primary active:scale-[0.98]"
            >
              {c.visibility === 'private' ? 'Solicitar entrada' : 'Entrar'}
            </button>
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
