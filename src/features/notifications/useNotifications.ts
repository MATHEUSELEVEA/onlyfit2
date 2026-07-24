import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type ActivityNotification = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  createdAt: string;
  readAt: string | null;
  path: string | null;
  actor: {
    username: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
};

type NotificationRow = {
  id: string;
  type: string | null;
  title: string | null;
  description: string | null;
  created_at: string;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
  actor:
    | { username: string | null; full_name: string | null; avatar_url: string | null }
    | { username: string | null; full_name: string | null; avatar_url: string | null }[]
    | null;
};

export const notificationsKey = (userId?: string) => ['notifications', userId] as const;
export const notificationsUnreadKey = (userId?: string) => ['notifications', 'unread', userId] as const;

function firstActor(row: NotificationRow['actor']) {
  return Array.isArray(row) ? row[0] ?? null : row;
}

function sanitizePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  return trimmed;
}

function toNotification(row: NotificationRow): ActivityNotification {
  const actor = firstActor(row.actor);
  return {
    id: row.id,
    type: row.type ?? 'activity',
    title: row.title ?? 'Nova atividade',
    description: row.description,
    createdAt: row.created_at,
    readAt: row.read_at,
    path: sanitizePath(row.metadata?.path),
    actor: actor
      ? {
          username: actor.username,
          fullName: actor.full_name,
          avatarUrl: actor.avatar_url,
        }
      : null,
  };
}

export function useNotifications() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: notificationsKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<ActivityNotification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id,type,title,description,created_at,read_at,metadata,actor:profiles!notifications_actor_id_fkey(username,full_name,avatar_url)')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) throw error;
      return ((data ?? []) as unknown as NotificationRow[]).map(toNotification);
    },
  });
}

export function useUnreadNotificationsCount() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: notificationsUnreadKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId!)
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkNotificationsRead() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids?: string[]) => {
      if (!userId) return;
      let query = supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);
      if (ids?.length) query = query.in('id', ids);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsKey(userId) });
      queryClient.invalidateQueries({ queryKey: notificationsUnreadKey(userId) });
    },
  });
}

export function useRealtimeNotifications() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications_rt_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: notificationsKey(userId) });
          queryClient.invalidateQueries({ queryKey: notificationsUnreadKey(userId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);
}
