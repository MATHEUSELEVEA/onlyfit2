import { BadgeCheck, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { productTypeMeta } from '@/lib/products';
import { PriceBadge } from '@/components/ui/PriceBadge';
import { useTranslation } from '@/i18n/I18nProvider';
import type { MarketProduct } from './useMarket';

interface ProductCardProps {
  product: MarketProduct;
  /** Card em destaque: ocupa 2 colunas, com imagem grande e texto sobreposto. */
  featured?: boolean;
  /** Vitrine de Meus produtos: esconde preço e mostra "Adquirido". */
  owned?: boolean;
  isOfficialStore?: boolean;
}

export function ProductCard({ product, featured = false, owned = false, isOfficialStore = false }: ProductCardProps) {
  const { t } = useTranslation();
  const meta = productTypeMeta(product.type, product.marketItemType);
  const Icon = meta.icon;
  const image = product.coverImageUrl || product.thumbnailUrl;
  const to = `/produtos/${encodeURIComponent(product.id)}`;

  const typeChip = (
    <span className="inline-flex items-center gap-1 rounded-full bg-inverse-surface/80 px-2 py-0.5 font-sans text-counter text-inverse-on-surface backdrop-blur-sm">
      <Icon size={12} aria-hidden />
      {meta.label}
    </span>
  );

  // Variante em destaque: imagem cheia com texto sobreposto (padrão do Explorar).
  if (featured) {
    const inner = (
      <>
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-active:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/25 to-surface-container-high text-on-surface-variant">
            <Icon size={40} aria-hidden />
          </div>
        )}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-inverse-surface/95 via-inverse-surface/30 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          {typeChip}
          <PriceBadge price={product.price} owned={owned} />
        </div>
        {isOfficialStore && (
          <span className="absolute left-3 top-11 inline-flex items-center gap-1 rounded-full bg-primary/95 px-2 py-0.5 font-sans text-counter text-on-primary shadow-sm">
            <BadgeCheck size={12} aria-hidden />
            {t('market.officialStore')}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-3 text-inverse-on-surface">
          <p className="line-clamp-2 font-sans text-title drop-shadow">{product.name}</p>
          {product.description && (
            <p className="mt-1 line-clamp-2 font-sans text-body-sm text-inverse-on-surface/85">
              {product.description}
            </p>
          )}
          <p className="mt-1.5 truncate font-sans text-counter font-normal text-inverse-on-surface/80">
            {product.storeName}
          </p>
        </div>
      </>
    );
    const className =
      'group relative col-span-2 block aspect-[16/10] overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container';
    return (
      <Link to={to} className={className}>
        {inner}
      </Link>
    );
  }

  // Variante padrão: imagem em cima, corpo com tipo, título, descrição e rodapé.
  const inner = (
    <>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-container-high">
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-active:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-container-high to-surface-container text-on-surface-variant">
            <Icon size={30} aria-hidden />
          </div>
        )}
        <div className="absolute left-2 top-2">{typeChip}</div>
        {isOfficialStore && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary/95 px-2 py-0.5 font-sans text-counter text-on-primary shadow-sm">
            <BadgeCheck size={12} aria-hidden />
            {t('market.official')}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 font-sans text-body font-semibold text-on-surface">
          {product.name}
        </p>
        {product.description && (
          <p className="line-clamp-2 font-sans text-body-sm text-on-surface-variant">
            {product.description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          <span className="min-w-0 flex-1 truncate font-sans text-counter font-normal text-on-surface-variant">
            {product.storeName}
          </span>
          <PriceBadge price={product.price} owned={owned} />
        </div>
        <span className="mt-2 inline-flex items-center gap-1 self-start font-sans text-counter text-primary">
          {t('market.viewProduct')}
          <ChevronRight size={13} aria-hidden />
        </span>
      </div>
    </>
  );
  const className =
    'group flex flex-col overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest';
  return (
    <Link to={to} className={className}>
      {inner}
    </Link>
  );
}
