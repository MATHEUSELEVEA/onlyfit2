import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { inferProductSports } from '@/lib/products';
import { useAffinityGroups, type AffinityGroup } from '@/lib/sports';
import btgPactualLogoUrl from '@/assets/official-stores/btg-pactual.svg?url';
import integralmedicaLogoUrl from '@/assets/official-stores/integralmedica.svg?url';
import natuVidaLogoUrl from '@/assets/official-stores/natu-vida.svg?url';
import nikeLogoUrl from '@/assets/official-stores/nike.svg?url';

// Marketplace: leitura pública dos produtos à venda e leitura das compras do
// próprio usuário. Tudo somente leitura — o front nunca escreve em produto ou
// pagamento (regra 7 do CLAUDE.md). Se a RLS bloquear algo, a query volta
// vazia e a tela mostra estado vazio; nunca quebra.

export interface MarketProduct {
  id: string;
  name: string;
  description: string | null;
  type: string;
  marketItemType: string | null;
  thumbnailUrl: string | null;
  coverImageUrl: string | null;
  price: number;
  sales: number;
  /** Grupos de afinidade inferidos do texto, para o filtro por esporte. */
  sports: string[];
  creatorId: string;
  organizationId: string | null;
  storeName: string;
  storeSlug: string | null;
  storeLogoUrl: string | null;
  creatorName: string;
  creatorUsername: string | null;
  creatorAvatarUrl: string | null;
}

interface SellerProfile {
  full_name: string | null;
  avatar_url: string | null;
  username: string | null;
}

interface SellerOrganization {
  id: string;
  name: string | null;
  slug: string | null;
  logo_url: string | null;
  cover_url: string | null;
}

interface ProductRow {
  id: string;
  name: string | null;
  description: string | null;
  type: string | null;
  market_item_type: string | null;
  thumbnail_url: string | null;
  cover_image_url: string | null;
  price_public: number | null;
  price: number | null;
  sales: number | null;
  creator_id: string | null;
  tenant_id: string | null;
  organization_id?: string | null;
  organizations?: SellerOrganization | SellerOrganization[] | null;
  profiles: SellerProfile | SellerProfile[] | null;
}

export interface OfficialMarketStore {
  id: string;
  organizationId: string | null;
  slug: string;
  name: string;
  tagline: string | null;
  category: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  badgeLabel: string;
  sortOrder: number;
}

const OFFICIAL_MARKET_STORE_FALLBACKS: OfficialMarketStore[] = [
  {
    id: 'fallback-natu-vida',
    organizationId: null,
    slug: 'natu-vida',
    name: 'Natu Vida',
    tagline: 'Bem-estar, saúde e suplementação natural.',
    category: 'Suplementos naturais',
    logoUrl: natuVidaLogoUrl,
    coverImageUrl: null,
    badgeLabel: 'Loja oficial',
    sortOrder: 10,
  },
  {
    id: 'fallback-integralmedica',
    organizationId: null,
    slug: 'integralmedica',
    name: 'Integralmédica',
    tagline: 'Performance e suplementação esportiva.',
    category: 'Suplementos',
    logoUrl: integralmedicaLogoUrl,
    coverImageUrl: null,
    badgeLabel: 'Loja oficial',
    sortOrder: 20,
  },
  {
    id: 'fallback-nike',
    organizationId: null,
    slug: 'nike',
    name: 'Nike',
    tagline: 'Performance, treino e lifestyle esportivo.',
    category: 'Vestuário e performance',
    logoUrl: nikeLogoUrl,
    coverImageUrl: null,
    badgeLabel: 'Loja oficial',
    sortOrder: 30,
  },
  {
    id: 'fallback-btg-pactual',
    organizationId: null,
    slug: 'btg-pactual',
    name: 'BTG Pactual',
    tagline: 'Soluções financeiras para atletas e profissionais.',
    category: 'Parceiro financeiro',
    logoUrl: btgPactualLogoUrl,
    coverImageUrl: null,
    badgeLabel: 'Loja oficial',
    sortOrder: 40,
  },
];

const PRODUCT_COLUMNS_WITH_ORGANIZATIONS = `
  id, name, description, type, market_item_type,
  thumbnail_url, cover_image_url, price_public, price, sales,
  creator_id, tenant_id, organization_id,
  organizations:organization_id ( id, name, slug, logo_url, cover_url ),
  profiles:tenant_id ( full_name, avatar_url, username )
`;

const PRODUCT_COLUMNS_WITH_PROFILES = `
  id, name, description, type, market_item_type,
  thumbnail_url, cover_image_url, price_public, price, sales,
  creator_id, tenant_id, organization_id,
  profiles:tenant_id ( full_name, avatar_url, username )
`;

const PRODUCT_COLUMNS_PRODUCTS_ONLY = `
  id, name, description, type, market_item_type,
  thumbnail_url, cover_image_url, price_public, price, sales,
  creator_id, tenant_id
`;

function firstProfile(value: ProductRow['profiles']): SellerProfile | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function firstOrganization(value: ProductRow['organizations']): SellerOrganization | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isMissingEditorialTableError(error: unknown, tableName: string): boolean {
  const maybe = error as { code?: string; message?: string } | null | undefined;
  return maybe?.code === '42P01' || maybe?.code === 'PGRST205' || new RegExp(`${tableName}|does not exist`, 'i').test(maybe?.message ?? '');
}

function toMarketProduct(row: ProductRow, groups: AffinityGroup[]): MarketProduct {
  const seller = firstProfile(row.profiles);
  const organization = firstOrganization(row.organizations);
  const name = row.name ?? 'Produto';
  const description = row.description ?? null;
  const storeName = organization?.name || seller?.full_name || seller?.username || 'Loja';
  const storeLogoUrl = organization?.logo_url ?? seller?.avatar_url ?? null;
  return {
    id: row.id,
    name,
    description,
    type: row.type ?? 'product',
    marketItemType: row.market_item_type ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    coverImageUrl: row.cover_image_url ?? null,
    price: row.price_public ?? row.price ?? 0,
    sales: row.sales ?? 0,
    sports: inferProductSports(
      [name, description, row.type, row.market_item_type].filter(Boolean).join(' '),
      groups,
    ),
    creatorId: row.tenant_id ?? row.creator_id ?? '',
    organizationId: row.organization_id ?? null,
    storeName,
    storeSlug: organization?.slug ?? null,
    storeLogoUrl,
    creatorName: storeName,
    creatorUsername: seller?.username ?? null,
    creatorAvatarUrl: storeLogoUrl,
  };
}

// Todos os produtos publicados e à venda na plataforma. Assinatura sai da lista
// (é plano recorrente, tem fluxo próprio), como no Market do v1. Ordena por
// vendas para deixar o que bomba no topo.
export function useMarketProducts() {
  const { groups } = useAffinityGroups();
  // A afinidade sai do texto do produto no `select`, não no `queryFn`: quando a
  // taxonomia chega (ou muda), os produtos são remapeados sem refazer o fetch.
  const select = useCallback(
    (rows: ProductRow[]) => rows.map((row) => toMarketProduct(row, groups)),
    [groups],
  );

  return useQuery({
    queryKey: ['market-products'],
    staleTime: 5 * 60_000,
    select,
    queryFn: async (): Promise<ProductRow[]> => {
      const queryProducts = async (columns: string) => {
        const result = await supabase
          .from('products')
          .select(columns)
          .eq('is_published', true)
          .neq('active', false)
          .neq('type', 'subscription')
          // Comunidades e desafios não são vendáveis; nunca entram no Mercado.
          .not('market_item_type', 'in', '("community","challenge")')
          .order('sales', { ascending: false, nullsFirst: false })
          .limit(100);
        return result as { data: unknown[] | null; error: unknown };
      };

      const withOrganizations = await queryProducts(PRODUCT_COLUMNS_WITH_ORGANIZATIONS);
      if (!withOrganizations.error && withOrganizations.data != null) {
        return withOrganizations.data as unknown as ProductRow[];
      }

      const withProfiles = await queryProducts(PRODUCT_COLUMNS_WITH_PROFILES);
      if (!withProfiles.error && withProfiles.data != null) {
        return withProfiles.data as unknown as ProductRow[];
      }

      const productsOnly = await queryProducts(PRODUCT_COLUMNS_PRODUCTS_ONLY);
      if (productsOnly.error) throw productsOnly.error;
      return (productsOnly.data ?? []).map((row) => ({ ...(row as object), profiles: null })) as ProductRow[];
    },
  });
}

interface PurchaseRow {
  id: string;
  created_at: string | null;
  products: ProductRow | ProductRow[] | null;
}

// Produtos que o usuário comprou (Meus produtos). Junta product_purchases com
// o produto; o RLS já restringe às compras do próprio comprador.
export function usePurchasedProducts() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { groups } = useAffinityGroups();

  const select = useCallback(
    (rows: PurchaseRow[]) => {
      const purchased = rows
        .map((row) => {
          const product = Array.isArray(row.products) ? row.products[0] : row.products;
          return product ? toMarketProduct(product, groups) : null;
        })
        .filter((p): p is MarketProduct => p !== null);

      return purchased.filter(
        (product, index) => purchased.findIndex((item) => item.id === product.id) === index,
      );
    },
    [groups],
  );

  return useQuery({
    queryKey: ['purchased-products', userId],
    enabled: Boolean(userId),
    staleTime: 2 * 60_000,
    select,
    queryFn: async (): Promise<PurchaseRow[]> => {
      const queryPurchases = async (columns: string) => {
        const result = await supabase
          .from('product_purchases')
          .select(`id, created_at, products ( ${columns} )`)
          .eq('buyer_id', userId!)
          .order('created_at', { ascending: false })
          .limit(100);
        return result as { data: unknown[] | null; error: unknown };
      };

      const withOrganizations = await queryPurchases(PRODUCT_COLUMNS_WITH_ORGANIZATIONS);
      if (!withOrganizations.error && withOrganizations.data != null) {
        return withOrganizations.data as unknown as PurchaseRow[];
      }

      const withProfiles = await queryPurchases(PRODUCT_COLUMNS_WITH_PROFILES);
      if (!withProfiles.error && withProfiles.data != null) {
        return withProfiles.data as unknown as PurchaseRow[];
      }

      const productsOnly = await queryPurchases(PRODUCT_COLUMNS_PRODUCTS_ONLY);
      if (productsOnly.error) throw productsOnly.error;
      return (productsOnly.data ?? []) as unknown as PurchaseRow[];
    },
  });
}

export function useOfficialMarketStores() {
  return useQuery({
    queryKey: ['official-market-stores'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OfficialMarketStore[]> => {
      const { data, error } = await supabase
        .from('official_market_stores')
        .select('id, organization_id, slug, name, tagline, category, logo_url, cover_image_url, badge_label, sort_order')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        if (isMissingEditorialTableError(error, 'official_market_stores')) return OFFICIAL_MARKET_STORE_FALLBACKS;
        throw error;
      }

      const rows = (data ?? []) as Array<{
        id: string;
        organization_id: string | null;
        slug: string | null;
        name: string | null;
        tagline: string | null;
        category: string | null;
        logo_url: string | null;
        cover_image_url: string | null;
        badge_label: string | null;
        sort_order: number | null;
      }>;

      if (rows.length === 0) return OFFICIAL_MARKET_STORE_FALLBACKS;

      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id ?? null,
        slug: row.slug ?? '',
        name: row.name ?? '',
        tagline: row.tagline,
        category: row.category,
        logoUrl: row.logo_url,
        coverImageUrl: row.cover_image_url,
        badgeLabel: row.badge_label ?? 'Loja oficial',
        sortOrder: row.sort_order ?? 0,
      })).filter((store) => store.name);
    },
  });
}
