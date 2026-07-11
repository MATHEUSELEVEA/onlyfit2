import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Check,
  ChevronRight,
  Dumbbell,
  GraduationCap,
  Heart,
  Lock,
  MessageCircle,
  Package,
  Play,
  Salad,
  Share2,
  ShoppingBag,
  Trophy,
  Users,
  UsersRound,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { formatCount, formatPrice } from '@/lib/format';
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

// Rótulo + ícone por tipo de produto do marketplace (ebook, aulas, treino,
// dieta, comunidade, desafio, produto físico entregue em casa).
const PRODUCT_TYPE: Record<string, { label: string; icon: LucideIcon }> = {
  ebook: { label: 'Ebook', icon: BookOpen },
  course: { label: 'Aulas', icon: GraduationCap },
  aulas: { label: 'Aulas', icon: GraduationCap },
  training: { label: 'Treino', icon: Dumbbell },
  treino: { label: 'Treino', icon: Dumbbell },
  workout: { label: 'Treino', icon: Dumbbell },
  diet: { label: 'Dieta', icon: Salad },
  dieta: { label: 'Dieta', icon: Salad },
  nutrition: { label: 'Dieta', icon: Salad },
  physical: { label: 'Produto físico', icon: Package },
};

function productMeta(type: string) {
  return PRODUCT_TYPE[type.toLowerCase()] ?? { label: 'Produto', icon: ShoppingBag };
}

function PriceBadge({ price, verb }: { price: number; verb?: string }) {
  const free = !price || price <= 0;
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 font-sans text-counter',
        free ? 'bg-tertiary-container/60 text-on-tertiary-container' : 'bg-primary text-on-primary',
      )}
    >
      {free ? 'Grátis' : `${verb ? `${verb} ` : ''}${formatPrice(price)}`}
    </span>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="col-span-full px-2 py-10 text-center font-sans text-body text-on-surface-variant">
      {children}
    </p>
  );
}

function Thumb({ url, label, icon: Icon }: { url: string | null; label: string; icon: LucideIcon }) {
  if (url) {
    return <img src={url} alt={label} className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-container-high text-on-surface-variant">
      <Icon size={28} aria-hidden />
    </div>
  );
}

export function CreatorProfilePage() {
  const { username = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const seed = (location.state as { author?: FeedAuthor } | null)?.author;
  const [tab, setTab] = useState<TabKey>('free');
  const [subscribeNotice, setSubscribeNotice] = useState(false);

  const { data } = useCreatorInfo(username);

  const creator: CreatorInfo = data ?? {
    id: seed?.id ?? '',
    username,
    displayName: seed?.displayName ?? null,
    avatarUrl: seed?.avatarUrl ?? null,
    verified: seed?.verified ?? false,
    bio: null,
    category: null,
    subscriptionPrice: 0,
    followerCount: 0,
    subscriberCount: 0,
  };
  const creatorId = creator.id || null;

  const { data: following = false } = useCreatorFollowState(creatorId);
  const { data: subscribed = false } = useCreatorSubscription(creatorId);
  const toggleFollow = useToggleCreatorFollow(creatorId);

  function handleSubscribeClick() {
    if (subscribed) return;
    // Checkout de assinatura roda no servidor (regra 7); aqui só sinalizamos.
    setSubscribeNotice(true);
  }

  const subPrice = creator.subscriptionPrice;

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-background/90 px-2 pb-2 pt-safe-top backdrop-blur-md">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
            className="mt-2 flex h-11 w-11 items-center justify-center rounded-full text-on-surface active:bg-surface-container"
          >
            <ArrowLeft size={24} aria-hidden />
          </button>
          <span className="mt-2 truncate font-sans text-title text-on-surface">@{creator.username}</span>
        </div>
        <button
          type="button"
          aria-label="Compartilhar perfil"
          className="mt-2 flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant active:bg-surface-container"
        >
          <Share2 size={20} aria-hidden />
        </button>
      </header>

      <div className="flex flex-col items-center px-5 pt-2 text-center">
        {creator.avatarUrl ? (
          <img
            src={creator.avatarUrl}
            alt={`Avatar de @${creator.username}`}
            className="h-24 w-24 rounded-full border-2 border-primary object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-primary bg-surface-container-high font-sans text-title-lg text-on-surface">
            {creator.username.slice(0, 1).toUpperCase()}
          </div>
        )}

        {creator.displayName && (
          <h1 className="mt-3 flex items-center gap-1.5 font-sans text-title-lg text-on-surface">
            {creator.displayName}
            {creator.verified && (
              <BadgeCheck size={18} className="text-primary" aria-label="Verificado" />
            )}
          </h1>
        )}
        <span className="mt-0.5 font-sans text-body text-on-surface-variant">@{creator.username}</span>

        {creator.bio && (
          <p className="mt-3 max-w-md font-sans text-body text-on-surface">{creator.bio}</p>
        )}
        {creator.category && (
          <span className="mt-3 inline-flex rounded-full bg-secondary-container px-3 py-1 font-sans text-counter uppercase text-on-secondary-container">
            {creator.category}
          </span>
        )}

        {/* Stats */}
        <div className="mt-5 flex w-full max-w-xs items-stretch justify-around rounded-2xl border border-outline-variant/40 bg-surface-container-low py-3">
          <button
            type="button"
            onClick={() => setTab('followers')}
            className="flex flex-1 flex-col items-center active:opacity-70"
          >
            <span className="font-sans text-title text-on-surface">{formatCount(creator.followerCount)}</span>
            <span className="font-sans text-counter uppercase text-on-surface-variant">Seguidores</span>
          </button>
          <div className="w-px bg-outline-variant/40" aria-hidden />
          <div className="flex flex-1 flex-col items-center">
            <span className="font-sans text-title text-on-surface">{formatCount(creator.subscriberCount)}</span>
            <span className="font-sans text-counter uppercase text-on-surface-variant">Assinantes</span>
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-outline-variant/60 text-on-surface active:bg-surface-container"
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
      <div className="sticky top-[calc(env(safe-area-inset-top)+48px)] z-10 mt-6 border-b border-outline-variant/40 bg-background/90 backdrop-blur-md">
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-3">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={clsx(
                'flex min-h-[44px] shrink-0 items-center gap-1.5 border-b-2 px-3 font-sans text-label transition-colors',
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

      <div className="px-4 pt-4">
        <TabPanel tab={tab} creatorId={creatorId} subscribed={subscribed} onSubscribe={handleSubscribeClick} />
      </div>
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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-low px-6 py-12 text-center">
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
    return <EmptyState>{premium ? 'Sem conteúdo exclusivo por aqui ainda.' : 'Sem conteúdo gratuito por aqui ainda.'}</EmptyState>;
  }

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((p) => (
        <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-surface-container">
          <Thumb url={p.thumbnailUrl} label={p.title ?? 'Conteúdo'} icon={Play} />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
            <Heart size={12} className="text-white" fill="currentColor" aria-hidden />
            <span className="font-sans text-counter text-white">{formatCount(p.likes)}</span>
          </div>
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
        const meta = productMeta(p.type);
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

function ChallengesList({ creatorId }: { creatorId: string | null }) {
  const { data = [], isLoading } = useCreatorChallenges(creatorId);
  if (isLoading) return <GridSkeleton />;
  if (data.length === 0) return <EmptyState>Nenhum desafio ativo no momento.</EmptyState>;

  return (
    <div className="flex flex-col gap-3">
      {data.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-low p-3"
        >
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl">
            <Thumb url={c.coverImageUrl} label={c.name} icon={Trophy} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-sans text-body text-on-surface">{c.name}</p>
            <span className="font-sans text-counter text-on-surface-variant">
              {formatCount(c.participantCount)} participantes
            </span>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <PriceBadge price={c.price} />
            <span className="font-sans text-counter text-primary">
              {c.price > 0 ? 'Participar' : 'Entrar'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CommunitiesList({ creatorId }: { creatorId: string | null }) {
  const { data = [], isLoading } = useCreatorCommunities(creatorId);
  if (isLoading) return <GridSkeleton />;
  if (data.length === 0) return <EmptyState>Este criador ainda não tem comunidades.</EmptyState>;

  return (
    <div className="flex flex-col gap-3">
      {data.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-low p-3"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UsersRound size={22} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-sans text-body text-on-surface">{c.name}</p>
            <span className="font-sans text-counter text-on-surface-variant">
              {formatCount(c.memberCount)} membros
            </span>
          </div>
          <button
            type="button"
            className="inline-flex min-h-[36px] items-center rounded-full bg-primary px-4 font-sans text-label text-on-primary active:scale-[0.98]"
          >
            Entrar
          </button>
        </div>
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
                <span className="truncate font-sans text-counter text-on-surface-variant">
                  @{f.username}
                </span>
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
