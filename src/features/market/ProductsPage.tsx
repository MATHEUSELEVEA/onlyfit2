import { useMemo, useState, type ReactNode } from 'react';
import { BadgeCheck, Check, Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import { useSearchParams } from 'react-router-dom';
import { useAffinityGroups } from '@/lib/sports';
import { MARKET_CATEGORIES, productCategory } from '@/lib/products';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { ProductCard } from './ProductCard';
import { PurchasedProducts } from './PurchasedProducts';
import {
  useMarketProducts,
  useOfficialMarketStores,
  type MarketProduct,
  type OfficialMarketStore,
} from './useMarket';

type MarketTab = 'mercado' | 'compras';

function isFeatured(index: number): boolean {
  return index % 6 === 0;
}

function normalizeStoreKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function productStoreKeys(product: MarketProduct): string[] {
  return [product.organizationId, product.storeSlug, product.storeName, product.creatorName]
    .map(normalizeStoreKey)
    .filter(Boolean);
}

function officialStoreKeys(store: OfficialMarketStore): string[] {
  return [store.organizationId, store.slug, store.name]
    .map(normalizeStoreKey)
    .filter(Boolean);
}

function filterProducts(
  products: MarketProduct[],
  filters: {
    term: string;
    category: string | null;
    sport: string | null;
    freeOnly: boolean;
    officialOnly: boolean;
    selectedOfficialStoreKey: string | null;
    isOfficialProduct: (product: MarketProduct) => boolean;
  },
): MarketProduct[] {
  const {
    term,
    category,
    sport,
    freeOnly,
    officialOnly,
    selectedOfficialStoreKey,
    isOfficialProduct,
  } = filters;

  return products.filter((product) => {
    if (category && productCategory(product) !== category) return false;
    if (sport && !product.sports.includes(sport)) return false;
    if (freeOnly && product.price > 0) return false;
    if (officialOnly && !isOfficialProduct(product)) return false;
    if (officialOnly && selectedOfficialStoreKey && !productStoreKeys(product).includes(selectedOfficialStoreKey)) return false;
    if (term) {
      const haystack = `${product.name} ${product.description ?? ''} ${product.storeName} ${product.creatorName}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: MarketTab = searchParams.get('aba') === 'compras' ? 'compras' : 'mercado';
  const setTab = (next: MarketTab) => {
    setSearchParams(next === 'compras' ? { aba: 'compras' } : {}, { replace: true });
  };

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sport, setSport] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [officialOnly, setOfficialOnly] = useState(false);
  const [selectedOfficialStoreKey, setSelectedOfficialStoreKey] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const productsQuery = useMarketProducts();
  const officialStoresQuery = useOfficialMarketStores();
  const { groups } = useAffinityGroups();

  const isLoading = productsQuery.isLoading;
  const isError = productsQuery.isError;
  const products = useMemo((): MarketProduct[] => productsQuery.data ?? [], [productsQuery.data]);
  const officialStores = useMemo((): OfficialMarketStore[] => officialStoresQuery.data ?? [], [officialStoresQuery.data]);

  const officialStoreOrgIds = useMemo(
    () => new Set(officialStores.map((store) => store.organizationId).filter((id): id is string => Boolean(id))),
    [officialStores],
  );
  const officialStoreKeySet = useMemo(
    () => new Set(officialStores.flatMap(officialStoreKeys)),
    [officialStores],
  );
  const isOfficialProduct = useMemo(
    () => (product: MarketProduct) => {
      if (product.organizationId && officialStoreOrgIds.has(product.organizationId)) return true;
      return productStoreKeys(product).some((key) => officialStoreKeySet.has(key));
    },
    [officialStoreOrgIds, officialStoreKeySet],
  );

  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () => filterProducts(products, {
      term,
      category,
      sport,
      freeOnly,
      officialOnly,
      selectedOfficialStoreKey,
      isOfficialProduct,
    }),
    [products, term, category, sport, freeOnly, officialOnly, selectedOfficialStoreKey, isOfficialProduct],
  );
  const hasActiveFilters = category !== null || sport !== null || freeOnly || officialOnly;

  const TABS: { key: MarketTab; label: string }[] = [
    { key: 'mercado', label: 'Mercado' },
    { key: 'compras', label: 'Minhas compras' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <PageTopBar title="Mercado" showBackButton={false} />
      <div className="mx-auto w-full max-w-[720px]">
        <div className="grid grid-cols-2 px-4 pt-3" role="tablist" aria-label="Mercado e compras">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={clsx(
                'relative min-h-[40px] whitespace-nowrap pb-2 font-sans text-label transition-colors',
                tab === key ? 'text-on-surface' : 'text-on-surface-variant',
              )}
            >
              {label}
              {tab === key && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        {tab === 'compras' && <PurchasedProducts onBrowse={() => setTab('mercado')} />}

        {tab === 'mercado' && (
          <>
            <OfficialStoresRail
              stores={officialStores}
              loading={officialStoresQuery.isLoading && officialStores.length === 0}
              onSelect={(store) => {
                setOfficialOnly(true);
                setSelectedOfficialStoreKey(officialStoreKeys(store)[0] ?? null);
                setSearch('');
              }}
            />

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
                    placeholder="Buscar suplementos, treinos, roupas..."
                    aria-label="Buscar produtos"
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
            </div>

            {isLoading && (
              <div className="flex justify-center py-16">
                <Loader2 size={28} className="animate-spin text-on-surface-variant" aria-label="Carregando" />
              </div>
            )}

            {isError && !isLoading && (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <p className="font-sans text-body text-on-surface-variant">Não foi possível carregar os produtos.</p>
                <button
                  type="button"
                  onClick={() => productsQuery.refetch()}
                  className="min-h-[44px] rounded-full bg-primary px-6 font-sans text-label text-on-primary"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {!isLoading && !isError && visible.length === 0 && (
              <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
                <p className="font-sans text-title text-on-surface">Nenhum produto encontrado</p>
                <p className="font-sans text-body-sm text-on-surface-variant">
                  Tente outra busca ou remova os filtros.
                </p>
              </div>
            )}

            {!isLoading && !isError && visible.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-3 px-4">
                {visible.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    featured={isFeatured(index)}
                    isOfficialStore={isOfficialProduct(product)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {tab === 'mercado' && (
        <BottomSheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          title="Filtros"
          description="Encontre produtos do seu jeito."
        >
          <div className="space-y-6 px-5 pb-6 pt-1">
            <section>
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">Categoria</h2>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {MARKET_CATEGORIES.map(({ key, label, icon: Icon }) => {
                  const active = category === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCategory(active ? null : key)}
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
                })}
              </div>
            </section>

            <section>
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">Preço</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterOption active={!freeOnly} onClick={() => setFreeOnly(false)}>Todos</FilterOption>
                <FilterOption active={freeOnly} onClick={() => setFreeOnly(true)}>Grátis</FilterOption>
              </div>
            </section>

            <section>
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">Loja</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterOption
                  active={!officialOnly}
                  onClick={() => {
                    setOfficialOnly(false);
                    setSelectedOfficialStoreKey(null);
                  }}
                >
                  Todas
                </FilterOption>
                <FilterOption
                  active={officialOnly && selectedOfficialStoreKey === null}
                  onClick={() => {
                    setOfficialOnly(true);
                    setSelectedOfficialStoreKey(null);
                  }}
                >
                  Loja oficial
                </FilterOption>
              </div>
            </section>

            <section>
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">Modalidade</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterOption active={sport === null} onClick={() => setSport(null)}>Todas</FilterOption>
                {groups.map(({ key, label }) => (
                  <FilterOption key={key} active={sport === key} onClick={() => setSport(sport === key ? null : key)}>
                    {label}
                  </FilterOption>
                ))}
              </div>
            </section>

            <button
              type="button"
              onClick={() => {
                setCategory(null);
                setSport(null);
                setFreeOnly(false);
                setOfficialOnly(false);
                setSelectedOfficialStoreKey(null);
              }}
              className="min-h-[44px] w-full rounded-lg border border-outline-variant/50 font-sans text-label text-on-surface transition-colors active:bg-surface-container-high"
            >
              Limpar filtros
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function OfficialStoresRail({
  stores,
  loading,
  onSelect,
}: {
  stores: OfficialMarketStore[];
  loading: boolean;
  onSelect: (store: OfficialMarketStore) => void;
}) {
  if (!loading && stores.length === 0) return null;

  return (
    <section className="pt-4" aria-labelledby="official-stores-title">
      <div className="px-4">
        <p className="inline-flex items-center gap-1 font-sans text-eyebrow uppercase text-primary">
          <BadgeCheck size={14} aria-hidden />
          Patrocinadores
        </p>
        <h2 id="official-stores-title" className="font-sans text-title text-on-surface">
          Lojas oficiais
        </h2>
      </div>

      <div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loading
          ? Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-32 w-60 shrink-0 animate-pulse rounded-2xl bg-surface-container" aria-hidden />
            ))
          : stores.map((store) => (
              <button
                key={store.id}
                type="button"
                onClick={() => onSelect(store)}
                className="relative h-32 w-60 shrink-0 overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-3 text-left"
              >
                {store.coverImageUrl ? (
                  <img src={store.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-35" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-surface-container to-surface-container-lowest" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/35 to-transparent" />
                <div className="relative flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-outline-variant/25 bg-surface/80 font-sans text-body font-bold text-primary backdrop-blur-sm">
                      {store.logoUrl ? (
                        <img src={store.logoUrl} alt={store.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        store.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('')
                      )}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/95 px-2 py-0.5 font-sans text-counter text-on-primary">
                      <BadgeCheck size={12} aria-hidden />
                      Oficial
                    </span>
                  </div>
                  <div>
                    <p className="truncate font-sans text-title text-on-surface">{store.name}</p>
                    <p className="mt-0.5 line-clamp-1 font-sans text-body-sm text-on-surface-variant">
                      {store.category || store.tagline || 'Marca patrocinadora'}
                    </p>
                  </div>
                </div>
              </button>
            ))}
      </div>
    </section>
  );
}

function FilterOption({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 font-sans text-label transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-outline-variant/40 bg-surface text-on-surface-variant',
      )}
    >
      {active && <Check size={16} aria-hidden />}
      {children}
    </button>
  );
}
