import { useMemo, useState } from 'react';
import { Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import { FEED_SPORTS } from '@/lib/sports';
import { productTypeMeta } from '@/lib/products';
import { FilterChip } from '@/components/ui/FilterChip';
import { ProductCard } from './ProductCard';
import { useMarketProducts, type MarketProduct } from './useMarket';

// Um a cada seis produtos vira card em destaque (2 colunas), criando o ritmo
// de caixas maiores e menores pedido para o Mercado.
function isFeatured(index: number): boolean {
  return index % 6 === 0;
}

// Opções fixas de tipo de produto pedidas para o Mercado (mesmo padrão de
// lista fixa usado nas abas do Explorar), em vez de derivar dinamicamente do
// catálogo.
const TYPE_FILTERS: { key: string; label: string }[] = [
  { key: 'ebook', label: 'Ebook' },
  { key: 'training', label: 'Treino' },
  { key: 'diet', label: 'Dieta' },
];

function filterProducts(
  products: MarketProduct[],
  { term, type, sport, freeOnly }: { term: string; type: string | null; sport: string | null; freeOnly: boolean },
): MarketProduct[] {
  return products.filter((product) => {
    if (type && productTypeMeta(product.type, product.marketItemType).key !== type) return false;
    if (sport && !product.sports.includes(sport)) return false;
    if (freeOnly && product.price > 0) return false;
    if (term) {
      const haystack = `${product.name} ${product.description ?? ''} ${product.creatorName}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export function MarketPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [sport, setSport] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const productsQuery = useMarketProducts();

  const isLoading = productsQuery.isLoading;
  const isError = productsQuery.isError;
  const refetch = () => {
    productsQuery.refetch();
  };

  // Comunidades e desafios são ferramentas de engajamento (não vendáveis) e
  // vivem no Explorar — o Mercado lista apenas produtos de verdade (tabela
  // products).
  const products = useMemo((): MarketProduct[] => productsQuery.data ?? [], [productsQuery.data]);

  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () => filterProducts(products, { term, type, sport, freeOnly }),
    [products, term, type, sport, freeOnly],
  );
  const hasActiveFilters = type !== null || sport !== null || freeOnly;

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <div className="mx-auto w-full max-w-[720px]">
        {/* Cabeçalho: título + busca global + atalho para os filtros */}
        <header className="sticky top-0 z-10 bg-background/95 px-4 pb-3 pt-safe-top backdrop-blur-md">
          <h1 className="mt-3 font-sans text-title-lg text-on-surface">Mercado</h1>
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
                placeholder="Buscar treinos, ebooks, dietas, creators..."
                aria-label="Buscar produtos no mercado"
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

        {filtersOpen && (
          <>
            {/* Filtro por tipo de produto */}
            <div
              className="no-scrollbar mt-1 flex gap-2 overflow-x-auto px-4"
              role="tablist"
              aria-label="Tipo de produto"
            >
              <FilterChip active={type === null} onClick={() => setType(null)}>
                Todos
              </FilterChip>
              {TYPE_FILTERS.map(({ key, label }) => (
                <FilterChip key={key} active={type === key} onClick={() => setType(key)}>
                  {label}
                </FilterChip>
              ))}
            </div>

            {/* Filtro de preço */}
            <div className="mt-4 px-4">
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
              {FEED_SPORTS.map(({ key, label }) => (
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
              Não foi possível carregar o Mercado.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
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
          <div className="mt-5 grid grid-cols-2 gap-3 px-4">
            {visible.map((product, index) => (
              <ProductCard key={product.id} product={product} featured={isFeatured(index)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
