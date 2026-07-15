import { useMemo, useState } from 'react';
import { Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import { useAffinityGroups } from '@/lib/sports';
import { MARKET_CATEGORIES, productCategory } from '@/lib/products';
import { FilterChip } from '@/components/ui/FilterChip';
import { ProductCard } from './ProductCard';
import { useMarketProducts, type MarketProduct } from './useMarket';

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

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <div className="mx-auto w-full max-w-[720px]">
        {/* Cabeçalho: título + busca global + atalho para os filtros */}
        <header className="sticky top-0 z-10 bg-background/95 px-4 pb-3 pt-safe-top backdrop-blur-md">
          <h1 className="mt-3 font-sans text-title-lg text-on-surface">Produtos</h1>
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
                placeholder="Buscar suplementos, treinos, roupas..."
                aria-label="Buscar produtos"
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
        </header>

        {/* Corredores do marketplace: entrada rápida por categoria */}
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 py-3" aria-label="Categorias">
          {MARKET_CATEGORIES.map(({ key, label, icon: Icon }) => {
            const active = category === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(active ? null : key)}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5"
              >
                <span
                  className={clsx(
                    'flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors',
                    active
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-outline-variant/30 bg-surface-container text-on-surface-variant',
                  )}
                >
                  <Icon size={22} aria-hidden />
                </span>
                <span
                  className={clsx(
                    'text-center font-sans text-counter font-normal leading-tight',
                    active ? 'text-primary' : 'text-on-surface-variant',
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {filtersOpen && (
          <>
            {/* Filtro de preço */}
            <div className="mt-1 px-4">
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">Preço</h2>
            </div>
            <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Preço">
              <FilterChip active={!freeOnly} onClick={() => setFreeOnly(false)}>
                Todos
              </FilterChip>
              <FilterChip active={freeOnly} onClick={() => setFreeOnly(true)}>
                Grátis
              </FilterChip>
            </div>

            {/* Filtro por grupo de afinidade */}
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
      </div>
    </div>
  );
}
