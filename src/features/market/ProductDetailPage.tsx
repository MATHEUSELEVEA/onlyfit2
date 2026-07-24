import { BadgeCheck, ChevronRight, ExternalLink, Loader2, Store } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { productTypeMeta } from '@/lib/products';
import { formatPrice } from '@/lib/format';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { PriceBadge } from '@/components/ui/PriceBadge';
import { useTranslation } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthContext';
import { OfferingCheckoutError, useOfferingCheckout } from '@/features/payments/useOfferingCheckout';
import { useMarketProducts, useOfficialMarketStores, type MarketProduct } from './useMarket';

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

export function ProductDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { productId = '' } = useParams<{ productId: string }>();
  const productsQuery = useMarketProducts();
  const officialStoresQuery = useOfficialMarketStores();
  const checkout = useOfferingCheckout();
  const [notice, setNotice] = useState<string | null>(null);
  const product = productsQuery.data?.find((item) => item.id === productId) ?? null;
  const officialStoreKeySet = new Set(
    (officialStoresQuery.data ?? []).flatMap((store) =>
      [store.organizationId, store.slug, store.name].map(normalizeStoreKey).filter(Boolean),
    ),
  );
  const isOfficialStore = product
    ? productStoreKeys(product).some((key) => officialStoreKeySet.has(key))
    : false;

  if (productsQuery.isLoading) {
    return (
      <div className="h-full overflow-y-auto bg-background">
        <PageTopBar title={t('market.productDetail.title')} backFallback="/produtos" />
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-on-surface-variant" aria-label={t('common.loading')} />
        </div>
      </div>
    );
  }

  if (productsQuery.isError || !product) {
    return (
      <div className="h-full overflow-y-auto bg-background">
        <PageTopBar title={t('market.productDetail.title')} backFallback="/produtos" />
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="font-sans text-title text-on-surface">
            {productsQuery.isError ? t('market.loadError') : t('market.productDetail.notFound')}
          </p>
          <Link
            to="/produtos"
            className="inline-flex min-h-[44px] items-center rounded-full bg-primary px-6 font-sans text-label text-on-primary"
          >
            {t('market.productDetail.backToMarket')}
          </Link>
        </div>
      </div>
    );
  }

  const currentProduct = product;
	  const meta = productTypeMeta(currentProduct.type, currentProduct.marketItemType);
  const Icon = meta.icon;
  const image = currentProduct.coverImageUrl || currentProduct.thumbnailUrl;
	  const sellerProfileTo = currentProduct.creatorUsername
	    ? `/creator/${encodeURIComponent(currentProduct.creatorUsername)}`
	    : null;
  const canCheckout = Boolean(currentProduct.businessOfferingId && currentProduct.price > 0);

  function handleCheckout() {
    if (!currentProduct.businessOfferingId || checkout.isPending) return;
    setNotice(null);
    checkout.mutate(
      { offeringId: currentProduct.businessOfferingId, billingType: 'one_time' },
      {
        onSuccess: () => {
          setNotice('Compra criada. A confirmação do pagamento aparecerá em Pagamentos e em suas compras.');
          void queryClient.invalidateQueries({ queryKey: ['purchased-products', session?.user.id] });
          void queryClient.invalidateQueries({ queryKey: ['payment-transactions', session?.user.id] });
        },
        onError: (error) => {
          const code = error instanceof OfferingCheckoutError ? error.code : '';
          if (code === 'card_required' || code === 'payment_customer_required') {
            setNotice('Cadastre um cartão principal para concluir a compra.');
            navigate('/perfil/pagamentos?adicionarCartao=1');
            return;
          }
          if (code === 'offering_content_unavailable') {
            setNotice('Esta oferta ainda precisa finalizar a entrega antes de aceitar pagamento.');
            return;
          }
          setNotice('Não foi possível iniciar a compra. Tente novamente.');
        },
      },
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <PageTopBar title={t('market.productDetail.title')} backFallback="/produtos" />
      <main className="mx-auto w-full max-w-[720px] px-4 pt-4">
        <section className="overflow-hidden rounded-3xl border border-outline-variant/25 bg-surface-container-lowest">
          <div className="relative aspect-[4/3] bg-surface-container">
            {image ? (
              <img src={image} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-surface-container-high text-primary">
                <Icon size={48} aria-hidden />
              </div>
            )}
            <div className="absolute left-3 top-3">
              <PriceBadge price={product.price} />
            </div>
            {isOfficialStore && (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-sans text-counter text-on-primary shadow-sm">
                <BadgeCheck size={13} aria-hidden />
                {t('market.officialStore')}
              </span>
            )}
          </div>

          <div className="space-y-5 p-4">
            <div>
              <p className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 font-sans text-counter text-on-surface-variant">
                <Icon size={13} aria-hidden />
                {meta.label}
              </p>
              <h1 className="mt-3 font-sans text-headline-sm text-on-surface">
                {product.name}
              </h1>
              {product.description && (
                <p className="mt-2 whitespace-pre-line font-sans text-body text-on-surface-variant">
                  {product.description}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-outline-variant/25 bg-surface-container p-3">
              <p className="font-sans text-eyebrow uppercase text-primary">
                {t('market.productDetail.soldBy')}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-container-high font-sans text-title text-primary">
                  {product.storeLogoUrl ? (
                    <img src={product.storeLogoUrl} alt={product.storeName} className="h-full w-full object-cover" />
                  ) : (
                    <Store size={22} aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-title text-on-surface">
                    {product.storeName}
                  </p>
                  <p className="truncate font-sans text-body-sm text-on-surface-variant">
                    {product.organizationId
                      ? t('market.productDetail.businessStore')
                      : t('market.productDetail.creatorStore')}
                  </p>
                </div>
                {isOfficialStore && <BadgeCheck size={18} className="text-primary" aria-label={t('market.officialStore')} />}
              </div>
            </div>

	            <button
	              type="button"
	              disabled={!canCheckout || checkout.isPending}
	              onClick={handleCheckout}
	              className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-5 font-sans text-label ${
	                canCheckout
	                  ? 'bg-primary text-on-primary active:scale-[0.98]'
	                  : 'bg-primary/35 text-on-surface-variant'
	              }`}
	            >
	              {checkout.isPending ? (
	                <>
	                  <Loader2 size={18} className="animate-spin" aria-hidden />
	                  Processando
	                </>
	              ) : canCheckout ? (
	                t('market.productDetail.buy').replace('{price}', formatPrice(product.price))
	              ) : product.price > 0 ? (
	                t('market.productDetail.checkoutSoon').replace('{price}', formatPrice(product.price))
	              ) : (
	                t('market.productDetail.accessSoon')
	              )}
	              {!checkout.isPending && <ChevronRight size={18} aria-hidden />}
	            </button>

	            {notice && (
	              <p className="rounded-2xl border border-outline-variant/30 bg-surface-container px-3 py-2 font-sans text-body-sm text-on-surface-variant">
	                {notice}
	              </p>
	            )}

            {sellerProfileTo && !product.organizationId && (
              <Link
                to={sellerProfileTo}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-outline-variant/40 px-5 font-sans text-label text-on-surface"
              >
                {t('market.productDetail.viewCreator')}
                <ExternalLink size={16} aria-hidden />
              </Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
