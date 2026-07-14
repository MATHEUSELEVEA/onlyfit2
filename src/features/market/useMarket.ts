import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { inferProductSports } from '@/lib/products';

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
  creatorName: string;
  creatorUsername: string | null;
  creatorAvatarUrl: string | null;
}

interface SellerProfile {
  full_name: string | null;
  avatar_url: string | null;
  username: string | null;
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
  profiles: SellerProfile | SellerProfile[] | null;
}

const PRODUCT_COLUMNS = `
  id, name, description, type, market_item_type,
  thumbnail_url, cover_image_url, price_public, price, sales,
  creator_id, tenant_id,
  profiles:tenant_id ( full_name, avatar_url, username )
`;

function firstProfile(value: ProductRow['profiles']): SellerProfile | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toMarketProduct(row: ProductRow): MarketProduct {
  const seller = firstProfile(row.profiles);
  const name = row.name ?? 'Produto';
  const description = row.description ?? null;
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
    ),
    creatorId: row.tenant_id ?? row.creator_id ?? '',
    creatorName: seller?.full_name || seller?.username || 'Creator',
    creatorUsername: seller?.username ?? null,
    creatorAvatarUrl: seller?.avatar_url ?? null,
  };
}

// Todos os produtos publicados e à venda na plataforma. Assinatura sai da lista
// (é plano recorrente, tem fluxo próprio), como no Market do v1. Ordena por
// vendas para deixar o que bomba no topo.
export function useMarketProducts() {
  return useQuery({
    queryKey: ['market-products'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MarketProduct[]> => {
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_COLUMNS)
        .eq('is_published', true)
        .neq('active', false)
        .neq('type', 'subscription')
        // Comunidades e desafios não são vendáveis; nunca entram no Mercado.
        .not('market_item_type', 'in', '("community","challenge")')
        .order('sales', { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as unknown as ProductRow[]).map(toMarketProduct);
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

  return useQuery({
    queryKey: ['purchased-products', userId],
    enabled: Boolean(userId),
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<MarketProduct[]> => {
      const { data, error } = await supabase
        .from('product_purchases')
        .select(`id, created_at, products ( ${PRODUCT_COLUMNS} )`)
        .eq('buyer_id', userId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const purchased = ((data ?? []) as unknown as PurchaseRow[])
        .map((row) => {
          const product = Array.isArray(row.products) ? row.products[0] : row.products;
          return product ? toMarketProduct(product) : null;
        })
        .filter((p): p is MarketProduct => p !== null);

      return purchased.filter(
        (product, index) => purchased.findIndex((item) => item.id === product.id) === index,
      );
    },
  });
}
