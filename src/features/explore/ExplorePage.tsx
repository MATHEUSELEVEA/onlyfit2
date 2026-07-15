import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  Check,
  Heart,
  Loader2,
  Play,
  Search,
  SlidersHorizontal,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAffinityGroups } from '@/lib/sports';
import { formatCount } from '@/lib/format';
import { FilterChip } from '@/components/ui/FilterChip';
import { useToggleCreatorFollow } from '@/features/creators/useCreatorFollow';
import {
  useExploreCreators,
  useExploreContent,
  useExploreCommunities,
  useExploreChallenges,
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

function ContentTile({ item, featured }: { item: ExploreContentItem; featured?: boolean }) {
  return (
    <Link
      to={`/video/${encodeURIComponent(item.id)}`}
      className={clsx(
        'group relative block overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container',
        featured ? 'col-span-2 aspect-[16/10]' : 'aspect-square',
      )}
    >
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt={item.title || `Conteúdo de ${item.creatorName}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-active:scale-105"
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-primary/25 to-surface-container-high" />
      )}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
      />

      {item.hasVideo && (
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          <Play size={14} fill="currentColor" aria-label="Vídeo" />
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
      <div className="mx-auto w-full max-w-[720px]">
        {/* Cabeçalho: título + busca global + atalho para os filtros */}
        <header className="sticky top-0 z-10 bg-background/95 px-4 pb-3 pt-safe-top backdrop-blur-md">
          <h1 className="mt-3 font-sans text-title-lg text-on-surface">Explorar</h1>
          <div className="relative mt-3 flex items-center gap-2">
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
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-label="Mostrar filtros"
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

          {/* Abas de texto: o que o usuário está procurando */}
          <div
            className="no-scrollbar -mx-4 mt-3 flex gap-5 overflow-x-auto px-4"
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
                  'relative shrink-0 whitespace-nowrap pb-2 font-sans text-label transition-colors',
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
        </header>

        {filtersOpen && (
          <>
            {/* Identidade só filtra gente — aparece na aba Pessoas */}
            {tab === 'people' && (
              <>
                <div className="mt-3 px-4">
                  <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">
                    Pessoas
                  </h2>
                </div>
                <div
                  className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4"
                  role="tablist"
                  aria-label="Tipo de pessoa"
                >
                  {PEOPLE_KINDS.map(({ key, label }) => (
                    <FilterChip key={key} active={peopleKind === key} onClick={() => setPeopleKind(key)}>
                      {label}
                    </FilterChip>
                  ))}
                </div>
              </>
            )}

            {/* Filtros por grupo de afinidade */}
            <div className="mt-4 px-4">
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">
                Grupos de afinidade
              </h2>
            </div>
            <div
              className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4"
              role="tablist"
              aria-label="Grupos de afinidade"
            >
              <FilterChip active={sport === null} onClick={() => setSport(null)}>
                Todos
              </FilterChip>
              {groups.map(({ key, label }) => (
                <FilterChip key={key} active={sport === key} onClick={() => setSport(key)}>
                  {label}
                </FilterChip>
              ))}
            </div>
          </>
        )}

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
              <section className="mt-4 grid grid-cols-2 gap-2 px-4" aria-label="Conteúdos">
                {content.map((item, index) => (
                  <ContentTile key={item.id} item={item} featured={index === 0} />
                ))}
              </section>
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
    </div>
  );
}
