import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { chatKey, inboxKey, unreadKey } from './keys';

// Entrega quase-instantânea via Supabase Realtime (postgres_changes na tabela
// messages) — porte do onlyfit-desktop/src/hooks/useRealtimeMessages.ts. Sem
// peerId, mantém apenas a lista/contador vivos (usado no shell). Com peerId,
// também invalida a thread aberta.
export function useRealtimeMessages(peerId?: string) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const invalidateThread = (otherId: string | undefined) => {
      if (peerId && otherId === peerId) {
        queryClient.invalidateQueries({ queryKey: chatKey(userId, peerId) });
      }
    };

    const channel = supabase
      .channel(`dm_rt_${userId}_${peerId ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: inboxKey(userId) });
          queryClient.invalidateQueries({ queryKey: unreadKey(userId) });
          invalidateThread((payload.new as { sender_id?: string }).sender_id);
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${userId}` },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: inboxKey(userId) });
          invalidateThread((payload.new as { receiver_id?: string }).receiver_id);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: inboxKey(userId) });
          queryClient.invalidateQueries({ queryKey: unreadKey(userId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, peerId, queryClient]);

  // Recupera mensagens que chegaram em background ao voltar o foco à aba.
  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      queryClient.invalidateQueries({ queryKey: inboxKey(userId) });
      queryClient.invalidateQueries({ queryKey: unreadKey(userId) });
      if (peerId) queryClient.invalidateQueries({ queryKey: chatKey(userId, peerId) });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, peerId, queryClient]);
}
