import { useMemo, useState, type ReactNode } from 'react';
import { BadgeCheck, Check, Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useSearchParams } from 'react-router-dom';
import { useAffinityGroups } from '@/lib/sports';
import { MARKET_CATEGORIES, productCategory } from '@/lib/products';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { useTranslation } from '@/i18n/I18nProvider';
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
  const { t } = useTranslation();
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
  const selectedOfficialStore = useMemo(() => {
    if (!selectedOfficialStoreKey) return null;
    return officialStores.find((store) => officialStoreKeys(store).includes(selectedOfficialStoreKey)) ?? null;
  }, [officialStores, selectedOfficialStoreKey]);
  const selectedSportLabel = sport ? groups.find((group) => group.key === sport)?.label ?? sport : null;

  const TABS: { key: MarketTab; label: string }[] = [
    { key: 'mercado', label: t('market.tab.market') },
    { key: 'compras', label: t('market.tab.purchases') },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <PageTopBar title={t('market.title')} showBackButton={false} />
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
              activeStoreKey={selectedOfficialStoreKey}
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
                    placeholder={t('market.searchPlaceholder')}
                    aria-label={t('market.searchAria')}
                    className="min-h-[44px] w-full rounded-xl border border-outline-variant/40 bg-surface py-2 pl-11 pr-4 font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  aria-expanded={filtersOpen}
                  aria-label={t('market.filters.open')}
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

            {hasActiveFilters && (
              <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {selectedOfficialStore && (
                  <ActiveFilterChip
                    label={selectedOfficialStore.name}
                    onClear={() => {
                      setSelectedOfficialStoreKey(null);
                      setOfficialOnly(false);
                    }}
                  />
                )}
                {officialOnly && !selectedOfficialStore && (
                  <ActiveFilterChip label={t('market.officialStore')} onClear={() => setOfficialOnly(false)} />
                )}
                {category && (
                  <ActiveFilterChip
                    label={MARKET_CATEGORIES.find((item) => item.key === category)?.label ?? category}
                    onClear={() => setCategory(null)}
                  />
                )}
                {sport && (
                  <ActiveFilterChip label={selectedSportLabel ?? sport} onClear={() => setSport(null)} />
                )}
                {freeOnly && <ActiveFilterChip label={t('market.freeOnly')} onClear={() => setFreeOnly(false)} />}
                <button
                  type="button"
                  onClick={() => {
                    setCategory(null);
                    setSport(null);
                    setFreeOnly(false);
                    setOfficialOnly(false);
                    setSelectedOfficialStoreKey(null);
                  }}
                  className="shrink-0 rounded-full px-2 font-sans text-counter text-on-surface-variant"
                >
                  {t('market.filters.clear')}
                </button>
              </div>
            )}

            {isLoading && (
              <div className="flex justify-center py-16">
                <Loader2 size={28} className="animate-spin text-on-surface-variant" aria-label={t('common.loading')} />
              </div>
            )}

            {isError && !isLoading && (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <p className="font-sans text-body text-on-surface-variant">{t('market.loadError')}</p>
                <button
                  type="button"
                  onClick={() => productsQuery.refetch()}
                  className="min-h-[44px] rounded-full bg-primary px-6 font-sans text-label text-on-primary"
                >
                  {t('common.retry')}
                </button>
              </div>
            )}

            {!isLoading && !isError && visible.length === 0 && (
              <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
                <p className="font-sans text-title text-on-surface">{t('market.empty.title')}</p>
                <p className="font-sans text-body-sm text-on-surface-variant">
                  {selectedOfficialStore
                    ? t('market.empty.officialStore').replace('{store}', selectedOfficialStore.name)
                    : t('market.empty.description')}
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
          title={t('market.filters.title')}
          description={t('market.filters.description')}
        >
          <div className="space-y-6 px-5 pb-6 pt-1">
            <section>
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">{t('market.filters.category')}</h2>
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
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">{t('market.filters.price')}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterOption active={!freeOnly} onClick={() => setFreeOnly(false)}>{t('common.all')}</FilterOption>
                <FilterOption active={freeOnly} onClick={() => setFreeOnly(true)}>{t('market.freeOnly')}</FilterOption>
              </div>
            </section>

            <section>
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">{t('market.filters.store')}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterOption
                  active={!officialOnly}
                  onClick={() => {
                    setOfficialOnly(false);
                    setSelectedOfficialStoreKey(null);
                  }}
                >
                  {t('common.all')}
                </FilterOption>
                <FilterOption
                  active={officialOnly && selectedOfficialStoreKey === null}
                  onClick={() => {
                    setOfficialOnly(true);
                    setSelectedOfficialStoreKey(null);
                  }}
                >
                  {t('market.officialStore')}
                </FilterOption>
              </div>
            </section>

            <section>
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">{t('market.filters.sport')}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterOption active={sport === null} onClick={() => setSport(null)}>{t('common.all')}</FilterOption>
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
              {t('market.filters.clear')}
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
  activeStoreKey,
  onSelect,
}: {
  stores: OfficialMarketStore[];
  loading: boolean;
  activeStoreKey: string | null;
  onSelect: (store: OfficialMarketStore) => void;
}) {
  const { t } = useTranslation();
  if (!loading && stores.length === 0) return null;

  return (
    <section className="pt-4" aria-labelledby="official-stores-title">
      <div className="px-4">
        <h2 id="official-stores-title" className="inline-flex items-center gap-1 font-sans text-title text-on-surface">
          <BadgeCheck size={14} aria-hidden />
          {t('market.officialStores')}
        </h2>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 px-4 pb-1">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[120px] min-w-0 animate-pulse rounded-2xl bg-surface-container" aria-hidden />
            ))
          : stores.map((store) => {
              const active = activeStoreKey ? officialStoreKeys(store).includes(activeStoreKey) : false;
              return (
                <button
                  key={store.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(store)}
                  className={clsx(
                    'relative h-[120px] min-w-0 overflow-hidden rounded-2xl border p-3 text-left transition-all active:scale-[0.98]',
                    active
                      ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.18)]'
                      : 'border-outline-variant/25 bg-surface-container-lowest',
                  )}
                >
                  {store.coverImageUrl ? (
                    <img src={store.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-30" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/16 via-surface-container to-surface-container-lowest" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/92 via-background/45 to-transparent" />
                  <div className="relative flex h-full flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-outline-variant/25 bg-surface/80 font-sans text-body font-bold text-primary backdrop-blur-sm">
                        {store.logoUrl ? (
                          <img src={store.logoUrl} alt={store.name} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          store.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('')
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-background/35 px-2 py-0.5 font-sans text-counter text-primary shadow-sm backdrop-blur-md">
                        <BadgeCheck size={12} aria-hidden />
                        {t('market.official')}
                      </span>
                    </div>
                    <div>
                      <p className="truncate font-sans text-title text-on-surface">{store.name}</p>
                      <p className="mt-0.5 line-clamp-1 font-sans text-body-sm text-on-surface-variant">
                        {store.category || store.tagline || t('market.sponsorBrand')}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
      </div>
    </section>
  );
}

function ActiveFilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-full border border-primary/45 bg-primary/10 px-3 font-sans text-counter text-primary"
    >
      {label}
      <X size={13} aria-hidden />
    </button>
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
