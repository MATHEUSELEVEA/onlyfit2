import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Heart, Loader2, Play, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { FEED_SPORTS, sportLabel } from '@/lib/sports';
import { formatCount } from '@/lib/format';
import { FilterChip } from '@/components/ui/FilterChip';
import { ProductCard } from '@/features/market/ProductCard';
import { useMarketProducts } from '@/features/market/useMarket';
import { useToggleCreatorFollow } from '@/features/creators/useCreatorFollow';
import {
  useExploreCreators,
  useExploreContent,
  type ExploreCreator,
  type ExploreContentItem,
} from './useExplore';

type ExploreTab = 'all' | 'people' | 'content' | 'products';

const TABS: { key: ExploreTab; label: string }[] = [
  { key: 'all', label: 'Tudo' },
  { key: 'people', label: 'Pessoas' },
  { key: 'content', label: 'Conteúdo' },
  { key: 'products', label: 'Produtos' },
];

function CreatorCard({ creator }: { creator: ExploreCreator }) {
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
            {creator.sports.slice(0, 3).map(sportLabel).join(' · ')}
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
  const to = item.creatorUsername ? `/creator/${encodeURIComponent(item.creatorUsername)}` : '/explorar';

  return (
    <Link
      to={to}
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
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
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

export function ExplorePage() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<ExploreTab>('all');
  const [sport, setSport] = useState<string | null>(null);

  const creatorsQuery = useExploreCreators();
  const contentQuery = useExploreContent();
  const productsQuery = useMarketProducts();

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
    if (sport) list = list.filter((creator) => creator.sports.includes(sport));
    if (term) {
      list = list.filter(
        (creator) =>
          creator.name.toLowerCase().includes(term) ||
          (creator.username ?? '').toLowerCase().includes(term),
      );
    }
    return list;
  }, [creatorsQuery.data, sport, term]);

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

  const products = useMemo(() => {
    let list = productsQuery.data ?? [];
    if (sport) list = list.filter((product) => product.sports.includes(sport));
    if (term) {
      list = list.filter((product) =>
        `${product.name} ${product.description ?? ''} ${product.creatorName}`
          .toLowerCase()
          .includes(term),
      );
    }
    return list;
  }, [productsQuery.data, sport, term]);

  const showPeople = tab === 'all' || tab === 'people';
  const showContent = tab === 'all' || tab === 'content';
  const showProducts = tab === 'all' || tab === 'products';
  const isLoading =
    (showPeople && creatorsQuery.isLoading) ||
    (showContent && contentQuery.isLoading) ||
    (showProducts && productsQuery.isLoading);
  const isEmpty =
    !isLoading &&
    (!showPeople || creators.length === 0) &&
    (!showContent || content.length === 0) &&
    (!showProducts || products.length === 0);
  const hasError =
    (showPeople && creatorsQuery.isError) ||
    (showContent && contentQuery.isError) ||
    (showProducts && productsQuery.isError);

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <div className="mx-auto w-full max-w-[720px]">
        {/* Cabeçalho: título + busca */}
        <header className="sticky top-0 z-10 bg-background/95 px-4 pb-3 pt-safe-top backdrop-blur-md">
          <h1 className="mt-3 font-sans text-title-lg text-on-surface">Explorar</h1>
          <div className="relative mt-3">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar creators, conteúdos e produtos..."
              aria-label="Buscar creators, conteúdos e produtos"
              className="min-h-[44px] w-full rounded-xl border border-outline-variant/40 bg-surface py-2 pl-11 pr-4 font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </header>

        {/* Filtros por tipo */}
        <div className="no-scrollbar mt-1 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Tipo de resultado">
          {TABS.map(({ key, label }) => (
            <FilterChip key={key} active={tab === key} onClick={() => setTab(key)}>
              {label}
            </FilterChip>
          ))}
        </div>

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
          {FEED_SPORTS.map(({ key, label }) => (
            <FilterChip key={key} active={sport === key} onClick={() => setSport(key)}>
              {label}
            </FilterChip>
          ))}
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="animate-spin text-on-surface-variant" aria-label="Carregando" />
          </div>
        )}

        {hasError && !isLoading && (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="font-sans text-body text-on-surface-variant">
              Não foi possível carregar o Explorar.
            </p>
            <button
              type="button"
              onClick={() => {
                creatorsQuery.refetch();
                contentQuery.refetch();
                productsQuery.refetch();
              }}
              className="min-h-[44px] rounded-full bg-primary px-6 font-sans text-label text-on-primary"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {isEmpty && !hasError && (
          <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
            <p className="font-sans text-title text-on-surface">Nada encontrado</p>
            <p className="font-sans text-body-sm text-on-surface-variant">
              Tente outra busca ou remova os filtros.
            </p>
          </div>
        )}

        {/* Pessoas */}
        {showPeople && !isLoading && creators.length > 0 && (
          <section className="mt-6" aria-labelledby="explore-people-title">
            <h2 id="explore-people-title" className="px-4 font-sans text-title text-on-surface">
              Creators
            </h2>
            <ul className="mt-2 divide-y divide-outline-variant/20">
              {(tab === 'people' ? creators : creators.slice(0, 4)).map((creator) => (
                <CreatorCard key={creator.id} creator={creator} />
              ))}
            </ul>
          </section>
        )}

        {/* Conteúdo em mosaico (padrão explore_hub) */}
        {showContent && !isLoading && content.length > 0 && (
          <section className="mt-6 px-4" aria-labelledby="explore-content-title">
            <h2 id="explore-content-title" className="font-sans text-title text-on-surface">
              Em alta
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {content.map((item, index) => (
                <ContentTile key={item.id} item={item} featured={index === 0} />
              ))}
            </div>
          </section>
        )}

        {showProducts && !isLoading && products.length > 0 && (
          <section className="mt-6 px-4" aria-labelledby="explore-products-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="explore-products-title" className="font-sans text-title text-on-surface">
                Produtos em destaque
              </h2>
              {tab === 'all' && (
                <Link to="/mercado" className="font-sans text-label text-primary">
                  Ver todos
                </Link>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(tab === 'products' ? products : products.slice(0, 5)).map((product, index) => (
                <ProductCard key={product.id} product={product} featured={index === 0} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
