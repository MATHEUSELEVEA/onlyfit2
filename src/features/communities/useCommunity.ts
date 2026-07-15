import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { COMMUNITY_COLUMNS } from './useCommunities';
import type { Community, CommunityMember, JoinRequest, MembershipStatus } from './types';

const MEMBER_PROFILE = 'id, username, full_name, avatar_url';

export function useCommunity(communityId: string | undefined) {
  return useQuery({
    queryKey: ['community', communityId] as const,
    enabled: Boolean(communityId),
    queryFn: async (): Promise<Community | null> => {
      const { data, error } = await supabase
        .from('communities')
        .select(COMMUNITY_COLUMNS)
        .eq('id', communityId!)
        .maybeSingle();
      if (error) throw error;
      return (data as Community) ?? null;
    },
  });
}

export function membershipQueryKey(communityId: string | undefined, userId: string | undefined) {
  return ['community-membership', communityId, userId] as const;
}

/** Minha relação com a comunidade: dono, membro, pedido pendente, banido ou nada. */
export function useMyMembership(community: Community | null | undefined, userId: string | undefined) {
  const communityId = community?.id;
  return useQuery({
    queryKey: membershipQueryKey(communityId, userId),
    enabled: Boolean(communityId && userId),
    queryFn: async (): Promise<MembershipStatus> => {
      if (!communityId || !userId) return 'none';
      if (community?.creator_id === userId) return 'owner';
      const [member, ban, request] = await Promise.all([
        supabase
          .from('community_members')
          .select('user_id')
          .eq('community_id', communityId)
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('community_bans')
          .select('user_id')
          .eq('community_id', communityId)
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('community_join_requests')
          .select('id')
          .eq('community_id', communityId)
          .eq('requester_id', userId)
          .eq('status', 'pending')
          .maybeSingle(),
      ]);
      if (member.error) throw member.error;
      if (ban.error) throw ban.error;
      if (request.error) throw request.error;
      if (ban.data) return 'banned';
      if (member.data) return 'member';
      if (request.data) return 'pending';
      return 'none';
    },
  });
}

export function useCommunityMembers(communityId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['community-members', communityId] as const,
    enabled: Boolean(communityId) && enabled,
    queryFn: async (): Promise<CommunityMember[]> => {
      const { data, error } = await supabase
        .from('community_members')
        .select(`user_id, profile:user_id(${MEMBER_PROFILE})`)
        .eq('community_id', communityId!);
      if (error) throw error;
      return (data ?? []) as unknown as CommunityMember[];
    },
  });
}

/** Pedidos pendentes — só o dono enxerga (RLS garante). */
export function useJoinRequests(communityId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['community-join-requests', communityId] as const,
    enabled: Boolean(communityId) && enabled,
    queryFn: async (): Promise<JoinRequest[]> => {
      const { data, error } = await supabase
        .from('community_join_requests')
        .select(`id, requester_id, created_at, requester:requester_id(${MEMBER_PROFILE})`)
        .eq('community_id', communityId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as JoinRequest[];
    },
  });
}

function useInvalidateMembership(communityId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['community-membership', communityId] });
    queryClient.invalidateQueries({ queryKey: ['community-members', communityId] });
    queryClient.invalidateQueries({ queryKey: ['community-join-requests', communityId] });
    queryClient.invalidateQueries({ queryKey: ['community', communityId] });
    queryClient.invalidateQueries({ queryKey: ['communities'] });
  };
}

/** Entrar (pública) ou pedir entrada (privada) — o banco decide qual dos dois. */
export function useJoinCommunity(communityId: string | undefined) {
  const invalidate = useInvalidateMembership(communityId);
  return useMutation({
    mutationFn: async (): Promise<'joined' | 'requested' | 'member' | 'banned'> => {
      const { data, error } = await supabase.rpc('request_community_join', {
        p_community_id: communityId,
      });
      if (error) throw error;
      return data as 'joined' | 'requested' | 'member' | 'banned';
    },
    onSuccess: invalidate,
  });
}

export function useLeaveCommunity(communityId: string | undefined, userId: string | undefined) {
  const invalidate = useInvalidateMembership(communityId);
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', communityId!)
        .eq('user_id', userId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useReviewJoinRequest(communityId: string | undefined) {
  const invalidate = useInvalidateMembership(communityId);
  return useMutation({
    mutationFn: async ({ requestId, approve }: { requestId: string; approve: boolean }) => {
      const { error } = await supabase.rpc(
        approve ? 'approve_community_join_request' : 'reject_community_join_request',
        { p_request_id: requestId },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useBanMember(communityId: string | undefined) {
  const invalidate = useInvalidateMembership(communityId);
  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      const { error } = await supabase.rpc('ban_community_member', {
        p_community_id: communityId,
        p_user_id: userId,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
