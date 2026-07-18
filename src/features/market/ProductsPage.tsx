import { useMemo, useState } from 'react';
import { Check, Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import { useSearchParams } from 'react-router-dom';
import { useAffinityGroups } from '@/lib/sports';
import { MARKET_CATEGORIES, productCategory } from '@/lib/products';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { ProductCard } from './ProductCard';
import { PurchasedProducts } from './PurchasedProducts';
import { useMarketProducts, type MarketProduct } from './useMarket';

// Duas abas: a vitrine ("mercado", padrão) e o histórico de compras
// ("compras"). A aba ativa vive na URL (?aba=compras) para dar deep-link —
// é como o menu de configurações e a aba "Minhas compras" chegam direto ao
// histórico.
type MarketTab = 'mercado' | 'compras';

// Marketplace de saúde: vestuário, suplementos, acessórios e o digital pago
// (conteúdos, treinos, dietas). Esta é a casca — o catálogo de verdade, com
// carrinho, entrega e vitrine por vendedor, vem depois.

// Um a cada seis produtos vira card em destaque (2 colunas), criando o ritmo
// de caixas maiores e menores pedido para o marketplace.
function isFeatured(index: number): boolean {
  return index % 6 === 0;
}

function filterProducts(
  products: MarketProduct[],
  { term, category, sport, freeOnly }: { term: string; category: string | null; sport: string | null; freeOnly: boolean },
): MarketProduct[] {
  return products.filter((product) => {
    if (category && productCategory(product) !== category) return false;
    if (sport && !product.sports.includes(sport)) return false;
    if (freeOnly && product.price > 0) return false;
    if (term) {
      const haystack = `${product.name} ${product.description ?? ''} ${product.creatorName}`.toLowerCase();
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
  const [filtersOpen, setFiltersOpen] = useState(false);

  const productsQuery = useMarketProducts();
  const { groups } = useAffinityGroups();

  const isLoading = productsQuery.isLoading;
  const isError = productsQuery.isError;

  // Comunidades e desafios são ferramentas de engajamento (não vendáveis) e
  // vivem no Explorar — o Produtos lista apenas produtos de verdade (tabela
  // products).
  const products = useMemo((): MarketProduct[] => productsQuery.data ?? [], [productsQuery.data]);

  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () => filterProducts(products, { term, category, sport, freeOnly }),
    [products, term, category, sport, freeOnly],
  );
  const hasActiveFilters = sport !== null || freeOnly;

  const TABS: { key: MarketTab; label: string }[] = [
    { key: 'mercado', label: 'Mercado' },
    { key: 'compras', label: 'Minhas compras' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <PageTopBar title="Mercado" showBackButton={false} />
      <div className="mx-auto w-full max-w-[720px]">
        <div
          className="grid grid-cols-2 px-4 pt-3"
          role="tablist"
          aria-label="Mercado e compras"
        >
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
              {tab === key && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary"
                />
              )}
            </button>
          ))}
        </div>

        {tab === 'compras' && <PurchasedProducts onBrowse={() => setTab('mercado')} />}

        {tab === 'mercado' && (
          <>
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
            <Loader2
              size={28}
              className="animate-spin text-on-surface-variant"
              aria-label="Carregando"
            />
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="font-sans text-body text-on-surface-variant">
              Não foi possível carregar os produtos.
            </p>
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
              <ProductCard key={product.id} product={product} featured={isFeatured(index)} />
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

function FilterOption({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
