import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { inboxKey } from './keys';
import type { Conversation, MediaType, PeerProfile } from './types';

// Fonte da lista de conversas. Puxa todas as mensagens onde o usuário é remetente
// OU destinatário (mais recentes primeiro) e agrupa por parceiro — espelha a
// lógica do desktop (onlyfit-desktop/src/pages/Inbox.tsx), sem virtualização.

interface RawRow {
  id: string;
  body: string | null;
  media_type: MediaType | null;
  created_at: string;
  read: boolean;
  sender_id: string;
  receiver_id: string;
  sender: RawProfile | RawProfile[] | null;
  receiver: RawProfile | RawProfile[] | null;
}

interface RawProfile {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

function resolveProfile(raw: RawProfile | RawProfile[] | null): RawProfile | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

export function useConversations() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const query = useQuery({
    queryKey: inboxKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<RawRow[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select(
          `id, body, media_type, created_at, read, sender_id, receiver_id,
           sender:sender_id(id, name:full_name, avatar_url),
           receiver:receiver_id(id, name:full_name, avatar_url)`,
        )
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as RawRow[];
    },
  });

  const conversations = useMemo<Conversation[]>(() => {
    if (!userId) return [];
    const map = new Map<string, Conversation>();

    for (const row of query.data ?? []) {
      const isSender = row.sender_id === userId;
      const partner = resolveProfile(isSender ? row.receiver : row.sender);
      if (!partner?.id) continue;

      const existing = map.get(partner.id);
      if (!existing) {
        const peer: PeerProfile = {
          id: partner.id,
          name: partner.name,
          avatarUrl: partner.avatar_url,
        };
        map.set(partner.id, {
          peer,
          lastMessage: row.body,
          lastMediaType: row.media_type,
          timestamp: row.created_at,
          unread: !isSender && !row.read ? 1 : 0,
        });
      } else if (!isSender && !row.read) {
        existing.unread += 1;
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [query.data, userId]);

  return { conversations, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}
