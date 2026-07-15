import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Community } from './types';

export const COMMUNITY_COLUMNS =
  'id, creator_id, name, slug, description, rules_text, image_url, visibility, member_count, sports, created_at';

export interface CommunityInput {
  name: string;
  description: string;
  rules_text: string;
  image_url: string | null;
  visibility: 'public' | 'private';
  sports: string[];
}

// Slug legível a partir do nome; o índice único do banco resolve colisão
// (o insert tenta de novo com sufixo numérico).
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Comunidades que eu criei ou das quais sou membro. */
export function useMyCommunities(userId: string | undefined) {
  return useQuery({
    queryKey: ['communities', 'mine', userId] as const,
    enabled: Boolean(userId),
    queryFn: async (): Promise<Community[]> => {
      if (!userId) return [];
      const [memberships, owned] = await Promise.all([
        supabase.from('community_members').select('community_id').eq('user_id', userId),
        supabase
          .from('communities')
          .select(COMMUNITY_COLUMNS)
          .eq('creator_id', userId)
          .order('created_at', { ascending: false }),
      ]);
      if (memberships.error) throw memberships.error;
      if (owned.error) throw owned.error;

      const ownedRows = (owned.data ?? []) as Community[];
      const ownedIds = new Set(ownedRows.map((row) => row.id));
      const memberIds = (memberships.data ?? [])
        .map((row) => row.community_id as string)
        .filter((id) => !ownedIds.has(id));

      let memberRows: Community[] = [];
      if (memberIds.length > 0) {
        const { data, error } = await supabase
          .from('communities')
          .select(COMMUNITY_COLUMNS)
          .in('id', memberIds)
          .order('created_at', { ascending: false });
        if (error) throw error;
        memberRows = (data ?? []) as Community[];
      }
      return [...ownedRows, ...memberRows];
    },
  });
}

/** Descoberta: todas as comunidades visíveis, das maiores para as menores. */
export function useDiscoverCommunities(search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: ['communities', 'discover', term] as const,
    queryFn: async (): Promise<Community[]> => {
      let query = supabase
        .from('communities')
        .select(COMMUNITY_COLUMNS)
        .order('member_count', { ascending: false })
        .limit(60);
      if (term) query = query.ilike('name', `%${term}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Community[];
    },
  });
}

export function useCreateCommunity(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CommunityInput): Promise<Community> => {
      if (!userId) throw new Error('missing-user');
      const base = slugify(input.name) || 'comunidade';
      // Colisão de slug (23505) é rara: tenta o nome puro e depois sufixos.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const slug = attempt === 0 ? base : `${base}-${Math.floor(Math.random() * 10_000)}`;
        const { data, error } = await supabase
          .from('communities')
          .insert({ ...input, creator_id: userId, slug })
          .select(COMMUNITY_COLUMNS)
          .single();
        if (!error) return data as Community;
        if (error.code !== '23505') throw error;
      }
      throw new Error('slug-conflict');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communities'] }),
  });
}

export function useUpdateCommunity(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CommunityInput): Promise<Community> => {
      const { data, error } = await supabase
        .from('communities')
        .update(input)
        .eq('id', communityId)
        .select(COMMUNITY_COLUMNS)
        .single();
      if (error) throw error;
      return data as Community;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['community', communityId], data);
      queryClient.invalidateQueries({ queryKey: ['communities'] });
    },
  });
}

export function useDeleteCommunity(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('communities').delete().eq('id', communityId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['community', communityId] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
    },
  });
}
