import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { chatKey, inboxKey, peerKey, unreadKey } from './keys';
import type { ChatMessage, PeerProfile, SendPayload } from './types';

const MESSAGE_COLUMNS =
  'id, body, media_url, media_type, media_meta, created_at, read, sender_id, receiver_id';

/** Perfil do parceiro da conversa, resolvido pelo id da rota. */
export function usePeerProfile(peerId: string | undefined) {
  return useQuery({
    queryKey: peerKey(peerId),
    enabled: Boolean(peerId),
    queryFn: async (): Promise<PeerProfile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', peerId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { id: data.id, name: data.full_name, avatarUrl: data.avatar_url };
    },
  });
}

/** Mensagens da thread, ordem cronológica. */
export function useChatMessages(peerId: string | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: chatKey(userId, peerId),
    enabled: Boolean(userId && peerId),
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .or(
          `and(sender_id.eq.${userId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${userId})`,
        )
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });
}

/** Envio com update otimista: a bolha aparece na hora e é reconciliada no sucesso. */
export function useSendMessage(peerId: string | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SendPayload) => {
      if (!userId || !peerId) throw new Error('Sessão ou destinatário ausente');
      const { error } = await supabase.from('messages').insert({
        sender_id: userId,
        receiver_id: peerId,
        body: payload.body ?? null,
        media_url: payload.media_url ?? null,
        media_type: payload.media_type ?? null,
        media_meta: payload.media_meta ?? null,
      });
      if (error) throw error;
    },
    onMutate: async (payload) => {
      if (!userId || !peerId) return;
      const key = chatKey(userId, peerId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ChatMessage[]>(key);
      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        body: payload.body ?? null,
        media_url: payload.media_url ?? null,
        media_type: payload.media_type ?? null,
        media_meta: payload.media_meta ?? null,
        created_at: new Date().toISOString(),
        read: false,
        sender_id: userId,
        receiver_id: peerId,
        pending: true,
      };
      queryClient.setQueryData<ChatMessage[]>(key, (curr) => [...(curr ?? []), optimistic]);
      return { previous };
    },
    onError: (_err, _payload, context) => {
      if (!userId || !peerId) return;
      queryClient.setQueryData(chatKey(userId, peerId), context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: chatKey(userId, peerId) });
      queryClient.invalidateQueries({ queryKey: inboxKey(userId) });
    },
  });
}

/** Marca como lidas as mensagens recebidas ainda não lidas ao abrir a thread. */
export function useMarkThreadRead(peerId: string | undefined, messages: ChatMessage[]) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !peerId) return;
    const unreadIds = messages
      .filter((m) => m.receiver_id === userId && !m.read && !m.pending)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;

    void supabase
      .from('messages')
      .update({ read: true })
      .in('id', unreadIds)
      .then(({ error }) => {
        if (!error) {
          queryClient.invalidateQueries({ queryKey: inboxKey(userId) });
          queryClient.invalidateQueries({ queryKey: unreadKey(userId) });
        }
      });
  }, [messages, userId, peerId, queryClient]);
}
