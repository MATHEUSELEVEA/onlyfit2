import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeSocialLinks, type SocialLinks } from '@/lib/socialLinks';

// Dados do perfil público e das abas do hub do criador. Tudo somente leitura:
// o front nunca escreve em produto/pagamento (regra 7 do CLAUDE.md). As
// consultas filtram por itens publicados/públicos; se a RLS bloquear algo,
// a query volta vazia e a aba mostra estado vazio — nunca quebra a página.

export interface CreatorInfo {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  verified: boolean;
  bio: string | null;
  sports: string[];
  subscriptionPrice: number;
  followerCount: number;
  subscriberCount: number;
  socialLinks: SocialLinks;
}

export interface CreatorPremiumOffering {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingType: 'recurring';
  billingInterval: 'month' | '2month' | 'quarter' | 'semester' | 'year' | null;
}

interface CreatorProfileRow {
  bio: string | null;
  sports: string[] | null;
  subscription_price: number | null;
  follower_count: number | null;
  subscriber_count: number | null;
  verified: boolean | null;
}

// A relação profiles → creator_profiles vem como objeto ou array conforme o
// PostgREST resolve a cardinalidade; normaliza para um único registro.
function firstProfile(value: unknown): CreatorProfileRow | null {
  if (Array.isArray(value)) return (value[0] as CreatorProfileRow) ?? null;
  return (value as CreatorProfileRow) ?? null;
}

export function useCreatorInfo(username: string | undefined) {
  return useQuery({
    queryKey: ['creator-info', username],
    enabled: Boolean(username),
    queryFn: async (): Promise<CreatorInfo | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          `id, username, full_name, avatar_url, social_links,
           creator_profiles ( bio, sports, subscription_price, follower_count, subscriber_count, verified )`,
        )
        .eq('username', username!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const cp = firstProfile(data.creator_profiles);
      return {
        id: data.id,
        username: data.username ?? username!,
        displayName: data.full_name ?? null,
        avatarUrl: data.avatar_url ?? null,
        verified: cp?.verified === true,
        bio: cp?.bio ?? null,
        sports: cp?.sports ?? [],
        subscriptionPrice: cp?.subscription_price ?? 0,
        followerCount: cp?.follower_count ?? 0,
        subscriberCount: cp?.subscriber_count ?? 0,
        socialLinks: normalizeSocialLinks((data as { social_links?: unknown }).social_links),
      };
    },
  });
}

export function useCreatorPremiumOffering(creatorId: string | null | undefined) {
  return useQuery({
    queryKey: ['creator-premium-offering', creatorId],
    enabled: Boolean(creatorId),
    queryFn: async (): Promise<CreatorPremiumOffering | null> => {
      const { data, error } = await supabase
        .from('business_offerings')
        .select('id,name,price,currency,billing_type,billing_interval,status')
        .eq('owner_profile_id', creatorId!)
        .eq('offering_type', 'premium_content')
        .eq('status', 'active')
        .eq('billing_type', 'recurring')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.billing_type !== 'recurring' || data.price == null) return null;
      return {
        id: data.id,
        name: data.name ?? 'Assinatura premium',
        price: Number(data.price),
        currency: data.currency ?? 'BRL',
        billingType: 'recurring',
        billingInterval: data.billing_interval,
      };
    },
  });
}

export interface CreatorPost {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  isPremium: boolean;
  likes: number;
}

// Conteúdo do criador separado em gratuito x assinantes pela visibilidade/premium.
export function useCreatorContent(creatorId: string | null | undefined) {
  return useQuery({
    queryKey: ['creator-content', creatorId],
    enabled: Boolean(creatorId),
    queryFn: async (): Promise<CreatorPost[]> => {
      const { data, error } = await supabase
        .from('posts')
        .select('id, title, thumbnail_url, is_premium, visibility, likes, published_at')
        .eq('creator_id', creatorId!)
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(48);
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        title: p.title ?? null,
        thumbnailUrl: p.thumbnail_url ?? null,
        isPremium: Boolean(p.is_premium) || ['paid_members', 'premium'].includes(p.visibility ?? ''),
        likes: p.likes ?? 0,
      }));
    },
  });
}

export interface CreatorProduct {
  id: string;
  name: string;
  type: string;
  thumbnailUrl: string | null;
  price: number;
}

// Tipos que têm aba própria (desafio/comunidade/assinatura) saem da vitrine
// de produtos para não duplicar.
const NON_PRODUCT_TYPES = ['community', 'challenge', 'subscription'];

export function useCreatorProducts(creatorId: string | null | undefined) {
  return useQuery({
    queryKey: ['creator-hub-products', creatorId],
    enabled: Boolean(creatorId),
    queryFn: async (): Promise<CreatorProduct[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, type, thumbnail_url, cover_image_url, price_public, price, is_published, created_at')
        .or(`creator_id.eq.${creatorId},tenant_id.eq.${creatorId}`)
        .eq('is_published', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .filter((p) => !NON_PRODUCT_TYPES.includes(p.type ?? ''))
        .map((p) => ({
          id: p.id,
          name: p.name ?? 'Produto',
          type: p.type ?? 'product',
          thumbnailUrl: p.thumbnail_url || p.cover_image_url || null,
          price: p.price_public ?? p.price ?? 0,
        }));
    },
  });
}

export interface CreatorChallenge {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  participantCount: number;
}

export function useCreatorChallenges(creatorId: string | null | undefined) {
  return useQuery({
    queryKey: ['creator-hub-challenges', creatorId],
    enabled: Boolean(creatorId),
    queryFn: async (): Promise<CreatorChallenge[]> => {
      const { data, error } = await supabase
        .from('challenge_runs')
        .select('id, name, description, cover_image_url, participant_count, status, created_at')
        .eq('creator_id', creatorId!)
        .in('status', ['active', 'scheduled'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id,
        name: c.name ?? 'Desafio',
        description: c.description ?? null,
        coverImageUrl: c.cover_image_url ?? null,
        participantCount: c.participant_count ?? 0,
      }));
    },
  });
}

export interface CreatorCommunity {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  visibility: 'public' | 'private';
}

// Comunidades são ferramentas de engajamento (não vendáveis): públicas ou
// privadas (entrada por aprovação do criador). Aqui listamos as do criador.
export function useCreatorCommunities(creatorId: string | null | undefined) {
  return useQuery({
    queryKey: ['creator-hub-communities', creatorId],
    enabled: Boolean(creatorId),
    queryFn: async (): Promise<CreatorCommunity[]> => {
      const { data, error } = await supabase
        .from('communities')
        .select('id, name, description, member_count, visibility, created_at')
        .eq('creator_id', creatorId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id,
        name: c.name ?? 'Comunidade',
        description: c.description ?? null,
        memberCount: c.member_count ?? 0,
        visibility: (c as { visibility?: string }).visibility === 'private' ? 'private' : 'public',
      }));
    },
  });
}

export interface CreatorFollower {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export function useCreatorFollowers(creatorId: string | null | undefined) {
  return useQuery({
    queryKey: ['creator-hub-followers', creatorId],
    enabled: Boolean(creatorId),
    queryFn: async (): Promise<CreatorFollower[]> => {
      const { data, error } = await supabase
        .from('creator_follows')
        .select('follower:profiles!creator_follows_follower_id_fkey ( id, username, full_name, avatar_url )')
        .eq('creator_id', creatorId!)
        .eq('status', 'active')
        .limit(60);
      if (error) throw error;
      return (data ?? [])
        .map((row) => {
          const f = firstProfile(row.follower) as
            | { id: string; username: string | null; full_name: string | null; avatar_url: string | null }
            | null;
          if (!f) return null;
          return {
            id: f.id,
            username: f.username ?? null,
            displayName: f.full_name ?? null,
            avatarUrl: f.avatar_url ?? null,
          };
        })
        .filter((f): f is CreatorFollower => f !== null);
    },
  });
}
