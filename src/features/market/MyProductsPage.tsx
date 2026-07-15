import { useMemo, useState } from 'react';
import { Loader2, Search, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { FilterChip } from '@/components/ui/FilterChip';
import { productTypeMeta } from '@/lib/products';
import { ProductCard } from './ProductCard';
import { usePurchasedProducts } from './useMarket';

export function MyProductsPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string | null>(null);
  const { data: products = [], isLoading, isError, refetch } = usePurchasedProducts();

  const typeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    products.forEach((product) => {
      const meta = productTypeMeta(product.type, product.marketItemType);
      if (!seen.has(meta.key)) seen.set(meta.key, meta.label);
    });
    return Array.from(seen, ([key, label]) => ({ key, label }));
  }, [products]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (type && productTypeMeta(product.type, product.marketItemType).key !== type) return false;
      if (!term) return true;
      return `${product.name} ${product.description ?? ''} ${product.creatorName}`
        .toLowerCase()
        .includes(term);
    });
  }, [products, search, type]);

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <PageTopBar title="Meus produtos" description="Tudo o que você já adquiriu" />
      <div className="mx-auto w-full max-w-[720px]">
        {products.length > 0 && (
          <div className="bg-background px-4 pb-3 pt-4">
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nos meus produtos..."
                aria-label="Buscar nos meus produtos"
                className="min-h-[44px] w-full rounded-xl border border-outline-variant/40 bg-surface py-2 pl-11 pr-4 font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        )}

        {typeOptions.length > 1 && (
          <div className="no-scrollbar mt-1 flex gap-2 overflow-x-auto px-4">
            <FilterChip active={type === null} onClick={() => setType(null)}>
              Todos
            </FilterChip>
            {typeOptions.map((option) => (
              <FilterChip
                key={option.key}
                active={type === option.key}
                onClick={() => setType(option.key)}
              >
                {option.label}
              </FilterChip>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="animate-spin text-on-surface-variant" aria-label="Carregando" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="font-sans text-body text-on-surface-variant">
              Não foi possível carregar seus produtos.
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

        {!isLoading && !isError && products.length === 0 && (
          <div className="flex flex-col items-center px-7 py-16 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
              <ShoppingBag size={28} aria-hidden />
            </span>
            <h2 className="mt-4 font-sans text-title text-on-surface">Sua coleção começa aqui</h2>
            <p className="mt-1 max-w-sm font-sans text-body text-on-surface-variant">
              Os treinos, ebooks, dietas e outros produtos que você comprar aparecerão nesta tela.
            </p>
            <Link
              to="/mercado"
              className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-primary px-6 font-sans text-label text-on-primary"
            >
              Explorar o Mercado
            </Link>
          </div>
        )}

        {!isLoading && !isError && products.length > 0 && visible.length === 0 && (
          <div className="px-6 py-14 text-center">
            <p className="font-sans text-title text-on-surface">Nenhum produto encontrado</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
              Tente outra busca ou remova o filtro.
            </p>
          </div>
        )}

        {!isLoading && !isError && visible.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 px-4">
            {visible.map((product) => (
              <ProductCard key={product.id} product={product} owned />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
