import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  Check,
  Heart,
  LayoutGrid,
  Loader2,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  UsersRound,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { affinityIcon, useAffinityGroups } from '@/lib/sports';
import {
  muteAfterAutoplayBlock,
  setVideoMuted,
  useVideoMuted,
} from '@/features/feed/videoSound';
import { formatCount } from '@/lib/format';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { useToggleCreatorFollow } from '@/features/creators/useCreatorFollow';
import {
  useExploreCreators,
  useExploreContent,
  useExploreCommunities,
  useExploreChallenges,
  useFeaturedAmbassadors,
  type ExploreCreator,
  type ExploreContentItem,
  type ExploreCommunity,
  type ExploreChallenge,
} from './useExplore';

// O Explorar é para descobrir de graça: conteúdo gratuito primeiro, depois
// pessoas, desafios e comunidades. Produto é venda e vive na aba Produtos.
type ExploreTab = 'content' | 'people' | 'challenges' | 'communities';

const TABS: { key: ExploreTab; label: string }[] = [
  { key: 'content', label: 'Conteúdo' },
  { key: 'people', label: 'Pessoas' },
  { key: 'challenges', label: 'Desafios' },
  { key: 'communities', label: 'Comunidades' },
];

// Filtro de identidade das pessoas (ver docs/ECOSYSTEM.md): profissional é quem
// tem a casca de profissional ligada; o resto é membro.
type PeopleKind = 'all' | 'professionals' | 'members';

const PEOPLE_KINDS: { key: PeopleKind; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'professionals', label: 'Profissionais' },
  { key: 'members', label: 'Membros' },
];

function CreatorCard({ creator }: { creator: ExploreCreator }) {
  const { labelFor } = useAffinityGroups();
  const toggleFollow = useToggleCreatorFollow(creator.id);
  const profileTo = creator.username ? `/creator/${encodeURIComponent(creator.username)}` : null;

  const identity = (
    <>
      {creator.avatarUrl ? (
        <img
          src={creator.avatarUrl}
          alt={`Avatar de ${creator.name}`}
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-container-high font-sans text-title text-on-surface"
          aria-hidden
        >
          {creator.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-sans text-body font-semibold text-on-surface">
          {creator.name}
        </span>
        <span className="mt-0.5 block truncate font-sans text-body-sm text-on-surface-variant">
          {creator.username ? `@${creator.username} · ` : ''}
          {formatCount(creator.followerCount)} seguidores
        </span>
        {creator.sports.length > 0 && (
          <span className="mt-0.5 block truncate font-sans text-counter font-normal text-on-surface-variant">
            {creator.sports.slice(0, 3).map(labelFor).join(' · ')}
          </span>
        )}
      </span>
    </>
  );

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {profileTo ? (
        <Link to={profileTo} className="flex min-w-0 flex-1 items-center gap-3">
          {identity}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{identity}</div>
      )}
      <button
        type="button"
        onClick={() => toggleFollow.mutate(!creator.followedByMe)}
        aria-pressed={creator.followedByMe}
        className={clsx(
          'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full px-4 font-sans text-label transition-all active:scale-95',
          creator.followedByMe
            ? 'bg-surface-container text-on-surface'
            : 'bg-primary text-on-primary',
        )}
      >
        {creator.followedByMe && <Check size={14} strokeWidth={3} aria-hidden />}
        {creator.followedByMe ? 'Seguindo' : 'Seguir'}
      </button>
    </li>
  );
}

function AmbassadorRail({
  ambassadors,
  loading,
}: {
  ambassadors: ExploreCreator[];
  loading: boolean;
}) {
  const { labelFor } = useAffinityGroups();
  if (!loading && ambassadors.length === 0) return null;

  return (
    <section className="pt-4" aria-labelledby="ambassadors-title">
      <div className="flex items-end justify-between px-4">
        <div>
          <p className="inline-flex items-center gap-1 font-sans text-eyebrow uppercase text-primary">
            <Sparkles size={14} aria-hidden />
            Embaixadores
          </p>
          <h2 id="ambassadors-title" className="font-sans text-title text-on-surface">
            Referências por modalidade
          </h2>
        </div>
      </div>

      <div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="w-20 shrink-0" aria-hidden>
                <div className="mx-auto h-[68px] w-[68px] animate-pulse rounded-full bg-surface-container" />
                <div className="mx-auto mt-2 h-3 w-16 animate-pulse rounded bg-surface-container" />
              </div>
            ))
          : ambassadors.map((ambassador) => {
              const profileTo = ambassador.username ? `/creator/${encodeURIComponent(ambassador.username)}` : null;
              const sport = ambassador.ambassadorSport || ambassador.sports[0] || null;
              const inner = (
                <>
                  <span className="mx-auto block h-[68px] w-[68px] rounded-full bg-gradient-to-br from-primary via-primary/60 to-surface-container p-[2px] shadow-[0_0_0_4px_hsl(var(--primary)/0.08)]">
                    <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-background bg-surface-container-high font-sans text-title text-primary">
                      {ambassador.avatarUrl ? (
                        <img src={ambassador.avatarUrl} alt={ambassador.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        ambassador.name.slice(0, 1).toUpperCase()
                      )}
                    </span>
                  </span>
                  <span className="mt-2 block truncate font-sans text-counter text-on-surface">
                    {ambassador.name}
                  </span>
                  <span className="block truncate font-sans text-counter font-normal text-on-surface-variant">
                    {ambassador.ambassadorHeadline || (sport ? labelFor(sport) : ambassador.ambassadorBadge || 'OnlyFit')}
                  </span>
                </>
              );
              return profileTo ? (
                <Link key={ambassador.id} to={profileTo} className="w-20 shrink-0 text-center">
                  {inner}
                </Link>
              ) : (
                <div key={ambassador.id} className="w-20 shrink-0 text-center">
                  {inner}
                </div>
              );
            })}
      </div>
    </section>
  );
}

// Fração do card que precisa estar visível para disputar o foco do autoplay.
const AUTOPLAY_VISIBILITY = 0.6;

type RegisterTile = (id: string, node: HTMLElement | null) => void;

function ContentTile({
  item,
  featured,
  active,
  register,
}: {
  item: ExploreContentItem;
  featured?: boolean;
  active?: boolean;
  register: RegisterTile;
}) {
  const tileRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failedVideoUrl, setFailedVideoUrl] = useState<string | null>(null);
  const muted = useVideoMuted();
  const playing = Boolean(active && item.videoUrl && item.videoUrl !== failedVideoUrl);

  // Só cards com vídeo disputam o foco; thumbnails puras nunca "tocam".
  useEffect(() => {
    if (!item.videoUrl) return;
    register(item.id, tileRef.current);
    return () => register(item.id, null);
  }, [item.id, item.videoUrl, register]);

  // Autoplay do card em foco, com o mesmo fallback de mudo do feed: iOS/Safari
  // barram som sem gesto, então o vídeo cai para mudo e toca assim mesmo.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!playing) {
      video.pause();
      return;
    }
    video.muted = muted;
    void video.play().catch(() => {
      video.muted = true;
      muteAfterAutoplayBlock();
      void video.play().catch(() => {});
    });
  }, [playing, muted]);

  return (
    <article
      ref={tileRef}
      data-tile-id={item.id}
      className={clsx(
        'relative overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container',
        featured ? 'col-span-2 aspect-[16/10]' : 'aspect-square',
      )}
    >
      <Link
        to={`/video/${encodeURIComponent(item.id)}`}
        className="group block h-full w-full"
        aria-label={`Abrir ${item.title || `conteúdo de ${item.creatorName}`}`}
      >
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.title || `Conteúdo de ${item.creatorName}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-active:scale-105 motion-reduce:transition-none"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/25 to-surface-container-high" />
        )}

        {/* A thumbnail também é o poster, evitando uma piscada ao iniciar. */}
        {playing && (
          <video
            ref={videoRef}
            src={item.videoUrl ?? undefined}
            poster={item.thumbnailUrl ?? undefined}
            className="absolute inset-0 h-full w-full object-cover"
            loop
            playsInline
            muted={muted}
            preload="metadata"
            onError={() => setFailedVideoUrl(item.videoUrl)}
          />
        )}

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
        />

        {item.hasVideo && !playing && (
          <span
            aria-hidden
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
          >
            <Play size={14} fill="currentColor" />
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 p-3 text-white">
          {item.title && (
            <p className={clsx('drop-shadow', featured ? 'font-sans text-title' : 'font-sans text-body-sm font-semibold', 'line-clamp-2')}>
              {item.title}
            </p>
          )}
          <p className="mt-0.5 flex items-center gap-2 font-sans text-counter font-normal text-white/85">
            <span className="truncate">{item.creatorName}</span>
            <span className="inline-flex shrink-0 items-center gap-0.5">
              <Heart size={11} fill="currentColor" aria-hidden /> {formatCount(item.likes)}
            </span>
          </p>
        </div>
      </Link>

      {/* Ação irmã do link: evita controles interativos aninhados. */}
      {playing && (
        <button
          type="button"
          onClick={() => setVideoMuted(!muted)}
          aria-label={muted ? 'Ativar som' : 'Desativar som'}
          aria-pressed={!muted}
          className="absolute right-1 top-1 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-lowest/60 text-on-surface backdrop-blur-sm transition-transform active:scale-95"
        >
          {muted ? <VolumeX size={20} aria-hidden /> : <Volume2 size={20} aria-hidden />}
        </button>
      )}
    </article>
  );
}

// Grade de conteúdo com preview estilo TikTok/Instagram: um IntersectionObserver
// acompanha quais cards com vídeo estão visíveis e elege o mais centralizado
// para tocar — um por vez. Respeita "reduzir movimento": aí nada toca sozinho.
function ContentGrid({ items }: { items: ExploreContentItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const ratiosRef = useRef(new Map<string, number>());
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const selectActive = useCallback(() => {
    if (document.visibilityState !== 'visible') {
      setActiveId(null);
      return;
    }

    let best: string | null = null;
    let shortestDistance = Number.POSITIVE_INFINITY;
    const viewportCenter = window.innerHeight / 2;
    ratiosRef.current.forEach((ratio, id) => {
      if (ratio < AUTOPLAY_VISIBILITY) return;
      const node = nodesRef.current.get(id);
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
      if (distance >= shortestDistance) return;
      best = id;
      shortestDistance = distance;
    });
    setActiveId(best);
  }, []);

  const register = useCallback<RegisterTile>((id, node) => {
    const nodes = nodesRef.current;
    const existing = nodes.get(id);
    if (existing && existing !== node) observerRef.current?.unobserve(existing);
    if (node) {
      nodes.set(id, node);
      observerRef.current?.observe(node);
    } else {
      nodes.delete(id);
      ratiosRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.tileId;
          if (id) ratiosRef.current.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        selectActive();
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 0.9, 1] },
    );
    observerRef.current = io;
    // Cards já montados (effects filhos rodam antes deste) entram agora.
    nodesRef.current.forEach((node) => io.observe(node));
    document.addEventListener('visibilitychange', selectActive);
    window.addEventListener('resize', selectActive);
    return () => {
      io.disconnect();
      observerRef.current = null;
      document.removeEventListener('visibilitychange', selectActive);
      window.removeEventListener('resize', selectActive);
    };
  }, [selectActive]);

  return (
    <section className="mt-4 grid grid-cols-2 gap-2 px-4" aria-label="Conteúdos">
      {items.map((item, index) => (
        <ContentTile
          key={item.id}
          item={item}
          featured={index === 0}
          active={activeId === item.id}
          register={register}
        />
      ))}
    </section>
  );
}

function CommunityTile({ community }: { community: ExploreCommunity }) {
  const to = community.creatorUsername
    ? `/creator/${encodeURIComponent(community.creatorUsername)}`
    : null;

  const inner = (
    <>
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-surface-container-high to-surface-container text-on-surface-variant">
        <UsersRound size={30} aria-hidden />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 font-sans text-body font-semibold text-on-surface">
          {community.name}
        </p>
        {community.description && (
          <p className="line-clamp-2 font-sans text-body-sm text-on-surface-variant">
            {community.description}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-1.5">
          <span className="min-w-0 flex-1 truncate font-sans text-counter font-normal text-on-surface-variant">
            {formatCount(community.memberCount)} membros
          </span>
        </div>
      </div>
    </>
  );
  const className =
    'group flex flex-col overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest';
  return to ? (
    <Link to={to} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

function ChallengeTile({ challenge }: { challenge: ExploreChallenge }) {
  const to = `/desafios/${challenge.id}`;

  const inner = (
    <>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-container-high">
        {challenge.coverImageUrl ? (
          <img
            src={challenge.coverImageUrl}
            alt={challenge.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-active:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-container-high to-surface-container text-on-surface-variant">
            <Trophy size={30} aria-hidden />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 font-sans text-body font-semibold text-on-surface">
          {challenge.name}
        </p>
        {challenge.description && (
          <p className="line-clamp-2 font-sans text-body-sm text-on-surface-variant">
            {challenge.description}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-1.5">
          <span className="min-w-0 flex-1 truncate font-sans text-counter font-normal text-on-surface-variant">
            {formatCount(challenge.participantCount)} participantes
          </span>
        </div>
      </div>
    </>
  );
  return (
    <Link
      to={to}
      className="group flex flex-col overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest"
    >
      {inner}
    </Link>
  );
}

export function ExplorePage() {
  const { groups } = useAffinityGroups();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<ExploreTab>('content');
  const [peopleKind, setPeopleKind] = useState<PeopleKind>('all');
  const [sport, setSport] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Busca de pessoas é server-side (cobre todos os usuários, não só a amostra
  // pré-carregada). Debounce evita uma query por tecla.
  const debouncedSearch = useDebouncedValue(search, 300);
  const creatorsQuery = useExploreCreators(debouncedSearch);
  const ambassadorsQuery = useFeaturedAmbassadors();
  const contentQuery = useExploreContent();
  const communitiesQuery = useExploreCommunities();
  const challengesQuery = useExploreChallenges();

  // Esportes por creator para o filtro de conteúdo (fallback quando o post
  // não tem tag própria — paridade com o feed do v1).
  const creatorSports = useMemo(() => {
    const map = new Map<string, string[]>();
    creatorsQuery.data?.forEach((creator) => map.set(creator.id, creator.sports));
    return map;
  }, [creatorsQuery.data]);

  const term = search.trim().toLowerCase();

  const ambassadors = useMemo(() => {
    const editorial = ambassadorsQuery.data ?? [];
    if (editorial.length > 0) return editorial;
    return (creatorsQuery.data ?? [])
      .filter((creator) => creator.isProfessional)
      .slice(0, 8);
  }, [ambassadorsQuery.data, creatorsQuery.data]);

  const creators = useMemo(() => {
    let list = creatorsQuery.data ?? [];
    if (peopleKind !== 'all') {
      const wantProfessional = peopleKind === 'professionals';
      list = list.filter((creator) => creator.isProfessional === wantProfessional);
    }
    if (sport) list = list.filter((creator) => creator.sports.includes(sport));
    if (term) {
      list = list.filter(
        (creator) =>
          creator.name.toLowerCase().includes(term) ||
          (creator.username ?? '').toLowerCase().includes(term),
      );
    }
    return list;
  }, [creatorsQuery.data, peopleKind, sport, term]);

  const content = useMemo(() => {
    let list = contentQuery.data ?? [];
    if (sport) {
      list = list.filter((item) => {
        const effective = item.sports.length > 0 ? item.sports : (creatorSports.get(item.creatorId) ?? []);
        return effective.includes(sport);
      });
    }
    if (term) {
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(term) ||
          item.creatorName.toLowerCase().includes(term),
      );
    }
    return list;
  }, [contentQuery.data, sport, term, creatorSports]);

  const communities = useMemo(() => {
    let list = communitiesQuery.data ?? [];
    if (sport) {
      list = list.filter((community) => (creatorSports.get(community.creatorId) ?? []).includes(sport));
    }
    if (term) {
      list = list.filter((community) =>
        `${community.name} ${community.description ?? ''} ${community.creatorName}`
          .toLowerCase()
          .includes(term),
      );
    }
    return list;
  }, [communitiesQuery.data, sport, term, creatorSports]);

  const challenges = useMemo(() => {
    let list = challengesQuery.data ?? [];
    if (sport) {
      list = list.filter((challenge) => (creatorSports.get(challenge.creatorId) ?? []).includes(sport));
    }
    if (term) {
      list = list.filter((challenge) =>
        `${challenge.name} ${challenge.description ?? ''} ${challenge.creatorName}`
          .toLowerCase()
          .includes(term),
      );
    }
    return list;
  }, [challengesQuery.data, sport, term, creatorSports]);

  // Cada aba responde por uma query só, então carregamento, erro e vazio saem
  // da aba ativa — nada de spinner por causa de uma lista que nem está na tela.
  const activeQuery = {
    content: contentQuery,
    people: creatorsQuery,
    challenges: challengesQuery,
    communities: communitiesQuery,
  }[tab];
  const activeCount = {
    content: content.length,
    people: creators.length,
    challenges: challenges.length,
    communities: communities.length,
  }[tab];

  const isLoading = activeQuery.isLoading;
  const hasError = activeQuery.isError;
  const isEmpty = !isLoading && !hasError && activeCount === 0;
  const hasActiveFilters = sport !== null || peopleKind !== 'all';

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <PageTopBar title="Explorar" showBackButton={false} />
      <div className="mx-auto w-full max-w-[720px]">
        <div className="px-4 pt-4">
          <div className="relative flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar conteúdos, pessoas, desafios..."
                aria-label="Buscar conteúdos, pessoas, desafios e comunidades"
                className="min-h-[44px] w-full rounded-xl border border-outline-variant/40 bg-surface py-2 pl-11 pr-4 font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-expanded={filtersOpen}
              aria-label="Abrir filtros"
              className={clsx(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
                filtersOpen || hasActiveFilters
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-outline-variant/40 bg-surface text-on-surface-variant',
              )}
            >
              <SlidersHorizontal size={18} aria-hidden />
            </button>
          </div>

          {/* Escopo da descoberta: sempre visível e sem rolagem. */}
          <div
            className="mt-3 grid grid-cols-4"
            role="tablist"
            aria-label="O que explorar"
          >
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={clsx(
                  'relative min-h-[36px] whitespace-nowrap pb-2 font-sans text-label transition-colors',
                  tab === key ? 'text-on-surface' : 'text-on-surface-variant',
                )}
              >
                {label}
                {tab === key && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        <AmbassadorRail
          ambassadors={ambassadors}
          loading={ambassadorsQuery.isLoading && ambassadors.length === 0}
        />

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="animate-spin text-on-surface-variant" aria-label="Carregando" />
          </div>
        )}

        {hasError && (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="font-sans text-body text-on-surface-variant">
              Não foi possível carregar o Explorar.
            </p>
            <button
              type="button"
              onClick={() => activeQuery.refetch()}
              className="min-h-[44px] rounded-full bg-primary px-6 font-sans text-label text-on-primary"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
            <p className="font-sans text-title text-on-surface">Nada encontrado</p>
            <p className="font-sans text-body-sm text-on-surface-variant">
              Tente outra busca ou remova os filtros.
            </p>
          </div>
        )}

        {!isLoading && !hasError && (
          <>
            {/* Conteúdo gratuito em mosaico (padrão explore_hub) */}
            {tab === 'content' && content.length > 0 && (
              <ContentGrid items={content} />
            )}

            {tab === 'people' && creators.length > 0 && (
              <ul className="mt-2 divide-y divide-outline-variant/20" aria-label="Pessoas">
                {creators.map((creator) => (
                  <CreatorCard key={creator.id} creator={creator} />
                ))}
              </ul>
            )}

            {tab === 'challenges' && challenges.length > 0 && (
              <section className="mt-4 grid grid-cols-2 gap-3 px-4" aria-label="Desafios">
                {challenges.map((challenge) => (
                  <ChallengeTile key={challenge.id} challenge={challenge} />
                ))}
              </section>
            )}

            {tab === 'communities' && communities.length > 0 && (
              <section className="mt-4 grid grid-cols-2 gap-3 px-4" aria-label="Comunidades">
                {communities.map((community) => (
                  <CommunityTile key={community.id} community={community} />
                ))}
              </section>
            )}
          </>
        )}
      </div>

      <BottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtros"
        description="Refine o que você quer descobrir."
      >
        <div className="space-y-6 px-5 pb-6 pt-1">
          {tab === 'people' && (
            <section>
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">Pessoas</h2>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {PEOPLE_KINDS.map(({ key, label }) => (
                  <ExploreFilterOption
                    key={key}
                    active={peopleKind === key}
                    onClick={() => setPeopleKind(key)}
                  >
                    {label}
                  </ExploreFilterOption>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">Modalidade</h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <AffinityFilterButton
                icon={LayoutGrid}
                label="Todos"
                active={sport === null}
                onClick={() => setSport(null)}
              />
              {groups.map((group) => (
                <AffinityFilterButton
                  key={group.key}
                  icon={affinityIcon(group.icon)}
                  label={group.label}
                  active={sport === group.key}
                  onClick={() => setSport(sport === group.key ? null : group.key)}
                />
              ))}
            </div>
          </section>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setPeopleKind('all');
                setSport(null);
              }}
              className="min-h-[44px] w-full rounded-lg border border-outline-variant/50 font-sans text-label text-on-surface transition-colors active:bg-surface-container-high"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

function AffinityFilterButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-outline-variant/30 bg-surface-container text-on-surface-variant',
      )}
    >
      <Icon size={22} aria-hidden />
      <span className="font-sans text-counter">{label}</span>
    </button>
  );
}

function ExploreFilterOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'min-h-[44px] rounded-full border px-3 font-sans text-label transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-outline-variant/40 bg-surface text-on-surface-variant',
      )}
    >
      {children}
    </button>
  );
}
