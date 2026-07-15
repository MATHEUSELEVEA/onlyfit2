import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PollOption, Reply, Topic } from './types';

const TOPIC_COLUMNS =
  'id, community_id, author_id, title, body, post_kind, is_pinned, is_closed, created_at, author:author_id(id, username, full_name, avatar_url), replies:community_post_comments(count)';

interface TopicRow extends Omit<Topic, 'reply_count'> {
  replies: { count: number }[];
}

function toTopic(row: TopicRow): Topic {
  const { replies, ...rest } = row;
  return { ...rest, reply_count: replies?.[0]?.count ?? 0 };
}

/** Tópicos do fórum ou avisos do dono, fixados primeiro. */
export function useTopics(communityId: string | undefined, kind: 'forum' | 'announcement') {
  return useQuery({
    queryKey: ['community-topics', communityId, kind] as const,
    enabled: Boolean(communityId),
    queryFn: async (): Promise<Topic[]> => {
      let query = supabase
        .from('community_posts')
        .select(TOPIC_COLUMNS)
        .eq('community_id', communityId!)
        .eq('is_library', false)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      query =
        kind === 'announcement'
          ? query.eq('post_kind', 'announcement')
          : query.neq('post_kind', 'announcement');
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as unknown as TopicRow[]).map(toTopic);
    },
  });
}

export function useTopic(topicId: string | undefined) {
  return useQuery({
    queryKey: ['community-topic', topicId] as const,
    enabled: Boolean(topicId),
    queryFn: async (): Promise<Topic | null> => {
      const { data, error } = await supabase
        .from('community_posts')
        .select(TOPIC_COLUMNS)
        .eq('id', topicId!)
        .maybeSingle();
      if (error) throw error;
      return data ? toTopic(data as unknown as TopicRow) : null;
    },
  });
}

export function useReplies(topicId: string | undefined) {
  return useQuery({
    queryKey: ['community-replies', topicId] as const,
    enabled: Boolean(topicId),
    queryFn: async (): Promise<Reply[]> => {
      const { data, error } = await supabase
        .from('community_post_comments')
        .select('id, post_id, author_id, body, created_at, author:author_id(id, username, full_name, avatar_url)')
        .eq('post_id', topicId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Reply[];
    },
  });
}

/** Opções da enquete com contagem de votos + em qual opção eu votei. */
export function usePoll(topic: Topic | null | undefined, userId: string | undefined) {
  const topicId = topic?.post_kind === 'poll' ? topic.id : undefined;
  return useQuery({
    queryKey: ['community-poll', topicId, userId] as const,
    enabled: Boolean(topicId),
    queryFn: async (): Promise<{ options: PollOption[]; myOptionId: string | null }> => {
      const [options, myVote] = await Promise.all([
        supabase
          .from('community_poll_options')
          .select('id, label, position, votes:community_poll_votes(count)')
          .eq('post_id', topicId!)
          .order('position', { ascending: true }),
        supabase
          .from('community_poll_votes')
          .select('option_id')
          .eq('post_id', topicId!)
          .eq('user_id', userId!)
          .maybeSingle(),
      ]);
      if (options.error) throw options.error;
      if (myVote.error) throw myVote.error;
      return {
        options: (options.data ?? []).map((row) => ({
          id: row.id as string,
          label: row.label as string,
          position: row.position as number,
          vote_count: (row.votes as { count: number }[] | null)?.[0]?.count ?? 0,
        })),
        myOptionId: (myVote.data?.option_id as string | undefined) ?? null,
      };
    },
  });
}

export interface NewTopicInput {
  title: string;
  body: string;
  kind: 'text' | 'poll' | 'announcement';
  pollOptions?: string[];
}

export function useCreateTopic(communityId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTopicInput): Promise<string> => {
      const { data, error } = await supabase
        .from('community_posts')
        .insert({
          community_id: communityId,
          author_id: userId,
          title: input.title,
          body: input.body,
          post_kind: input.kind,
        })
        .select('id')
        .single();
      if (error) throw error;
      const postId = data.id as string;
      if (input.kind === 'poll' && input.pollOptions?.length) {
        const { error: optionsError } = await supabase.from('community_poll_options').insert(
          input.pollOptions.map((label, position) => ({ post_id: postId, label, position })),
        );
        if (optionsError) throw optionsError;
      }
      return postId;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['community-topics', communityId] }),
  });
}

export function useCreateReply(topicId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from('community_post_comments')
        .insert({ post_id: topicId, author_id: userId, body });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-replies', topicId] });
      queryClient.invalidateQueries({ queryKey: ['community-topics'] });
    },
  });
}

export function useVotePoll(topicId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (optionId: string) => {
      const { error } = await supabase
        .from('community_poll_votes')
        .upsert(
          { post_id: topicId, option_id: optionId, user_id: userId },
          { onConflict: 'post_id,user_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['community-poll', topicId] }),
  });
}

/** Moderação do tópico: fixar, fechar e excluir (soft delete, como no desktop). */
export function useModerateTopic(communityId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      topicId,
      patch,
    }: {
      topicId: string;
      patch: { is_pinned?: boolean; is_closed?: boolean; deleted_at?: string };
    }) => {
      const { error } = await supabase.from('community_posts').update(patch).eq('id', topicId);
      if (error) throw error;
    },
    onSuccess: (_data, { topicId }) => {
      queryClient.invalidateQueries({ queryKey: ['community-topics', communityId] });
      queryClient.invalidateQueries({ queryKey: ['community-topic', topicId] });
    },
  });
}

export function useDeleteReply(topicId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (replyId: string) => {
      const { error } = await supabase
        .from('community_post_comments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', replyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-replies', topicId] });
      queryClient.invalidateQueries({ queryKey: ['community-topics'] });
    },
  });
}

export function useReportContent() {
  return useMutation({
    mutationFn: async ({ targetId, reason }: { targetId: string; reason: string }) => {
      const { error } = await supabase.rpc('submit_content_report', {
        p_target_type: 'community_post',
        p_target_id: targetId,
        p_reason: reason,
      });
      if (error) throw error;
    },
  });
}
