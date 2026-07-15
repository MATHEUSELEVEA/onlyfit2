import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { Flag, Loader2, Lock, LockOpen, Pin, PinOff, Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/I18nProvider';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { useCommunity, useMyMembership } from './useCommunity';
import {
  useCreateReply,
  useDeleteReply,
  useModerateTopic,
  usePoll,
  useReplies,
  useReportContent,
  useTopic,
  useVotePoll,
} from './useForum';
import { MemberAvatar } from './CommunityPage';
import type { Reply } from './types';

export function TopicPage() {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const { communityId, topicId } = useParams<{ communityId: string; topicId: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;

  const { data: community } = useCommunity(communityId);
  const { data: membership = 'none' } = useMyMembership(community, userId);
  const { data: topic, isLoading } = useTopic(topicId);
  const { data: replies = [] } = useReplies(topicId);
  const { data: poll } = usePoll(topic, userId);

  const replyMutation = useCreateReply(topicId, userId);
  const voteMutation = useVotePoll(topicId, userId);
  const moderateMutation = useModerateTopic(communityId);
  const deleteReplyMutation = useDeleteReply(topicId);
  const reportMutation = useReportContent();

  const [replyBody, setReplyBody] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const isOwner = membership === 'owner';
  const isAuthor = Boolean(userId && topic?.author_id === userId);
  const canReply = topic ? !topic.is_closed || isOwner : false;

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [language],
  );

  if (isLoading || !topic) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        {isLoading ? (
          <Loader2 size={28} className="animate-spin text-primary" aria-label={t('communities.loading')} />
        ) : (
          <p className="font-sans text-body text-on-surface-variant">{t('communities.notFound')}</p>
        )}
      </div>
    );
  }

  const authorName = topic.author?.full_name || topic.author?.username || t('communities.memberFallback');
  const totalVotes = (poll?.options ?? []).reduce((sum, option) => sum + option.vote_count, 0);

  async function handleReply() {
    const body = replyBody.trim();
    if (!body || replyMutation.isPending) return;
    setFeedback(null);
    try {
      await replyMutation.mutateAsync(body);
      setReplyBody('');
    } catch {
      setFeedback(t('communities.forum.replyError'));
    }
  }

  async function handleDeleteTopic() {
    if (!topicId || !window.confirm(t('communities.moderation.deleteTopicConfirm'))) return;
    try {
      await moderateMutation.mutateAsync({ topicId, patch: { deleted_at: new Date().toISOString() } });
      navigate(`/comunidades/${communityId}`, { replace: true });
    } catch {
      setFeedback(t('communities.moderation.actionError'));
    }
  }

  function handleReport() {
    if (!topicId || !window.confirm(t('communities.moderation.reportConfirm'))) return;
    reportMutation.mutate(
      { targetId: topicId, reason: 'other' },
      {
        onSuccess: () => setFeedback(t('communities.moderation.reportDone')),
        onError: () => setFeedback(t('communities.moderation.actionError')),
      },
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <PageTopBar title={topic.title || t('communities.forum.untitled')} backFallback={`/comunidades/${communityId}`} />

      <main className="mx-auto w-full max-w-[640px] flex-1 overflow-y-auto px-4 pb-4 pt-4">
        {/* Tópico */}
        <article className="rounded-2xl bg-surface-container p-4">
          <div className="flex items-center gap-3">
            <MemberAvatar profile={topic.author} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-sans text-body font-medium text-on-surface">{authorName}</p>
              <p className="font-sans text-body-sm text-on-surface-variant">
                {topic.created_at ? dateFormatter.format(new Date(topic.created_at)) : ''}
              </p>
            </div>
            {topic.is_pinned && <Pin size={16} className="shrink-0 text-primary" aria-label={t('communities.forum.pinned')} />}
            {topic.is_closed && (
              <Lock size={16} className="shrink-0 text-on-surface-variant" aria-label={t('communities.forum.closed')} />
            )}
          </div>

          {topic.body && (
            <p className="mt-3 whitespace-pre-wrap font-sans text-body text-on-surface">{topic.body}</p>
          )}

          {/* Enquete */}
          {topic.post_kind === 'poll' && poll && (
            <div className="mt-4 space-y-2" role="group" aria-label={t('communities.poll.badge')}>
              {poll.options.map((option) => {
                const isMine = poll.myOptionId === option.id;
                const percent = totalVotes > 0 ? Math.round((option.vote_count / totalVotes) * 100) : 0;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={voteMutation.isPending || topic.is_closed}
                    aria-pressed={isMine}
                    onClick={() => voteMutation.mutate(option.id)}
                    className={clsx(
                      'relative w-full overflow-hidden rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70',
                      isMine ? 'border-primary' : 'border-outline-variant/50 hover:bg-surface-container-high',
                    )}
                  >
                    <span
                      className="absolute inset-y-0 left-0 bg-primary/15 transition-[width]"
                      style={{ width: `${percent}%` }}
                      aria-hidden
                    />
                    <span className="relative flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-sans text-body text-on-surface">{option.label}</span>
                      <span className="shrink-0 font-sans text-body-sm text-on-surface-variant">
                        {percent}% ({option.vote_count})
                      </span>
                    </span>
                  </button>
                );
              })}
              <p className="font-sans text-body-sm text-on-surface-variant">
                {t(totalVotes === 1 ? 'communities.poll.totalVotesOne' : 'communities.poll.totalVotes').replace(
                  '{count}',
                  String(totalVotes),
                )}
              </p>
            </div>
          )}

          {/* Ações de moderação e denúncia */}
          <div className="mt-4 flex flex-wrap gap-2">
            {isOwner && (
              <>
                <ModerationButton
                  icon={topic.is_pinned ? PinOff : Pin}
                  label={topic.is_pinned ? t('communities.moderation.unpin') : t('communities.moderation.pin')}
                  disabled={moderateMutation.isPending}
                  onClick={() =>
                    moderateMutation.mutate({ topicId: topic.id, patch: { is_pinned: !topic.is_pinned } })
                  }
                />
                <ModerationButton
                  icon={topic.is_closed ? LockOpen : Lock}
                  label={topic.is_closed ? t('communities.moderation.reopen') : t('communities.moderation.close')}
                  disabled={moderateMutation.isPending}
                  onClick={() =>
                    moderateMutation.mutate({ topicId: topic.id, patch: { is_closed: !topic.is_closed } })
                  }
                />
              </>
            )}
            {(isOwner || isAuthor) && (
              <ModerationButton
                icon={Trash2}
                label={t('communities.moderation.deleteTopic')}
                tone="error"
                disabled={moderateMutation.isPending}
                onClick={() => void handleDeleteTopic()}
              />
            )}
            {!isAuthor && (
              <ModerationButton
                icon={Flag}
                label={t('communities.moderation.report')}
                disabled={reportMutation.isPending}
                onClick={handleReport}
              />
            )}
          </div>
        </article>

        {feedback && (
          <p role="alert" className="mt-3 px-1 font-sans text-body-sm text-on-surface-variant">
            {feedback}
          </p>
        )}

        {/* Respostas */}
        <h2 className="mt-5 px-1 font-sans text-label text-on-surface">
          {t(replies.length === 1 ? 'communities.forum.replyCountOne' : 'communities.forum.replyCount').replace(
            '{count}',
            String(replies.length),
          )}
        </h2>
        <div className="mt-2 space-y-2">
          {replies.map((reply) => (
            <ReplyCard
              key={reply.id}
              reply={reply}
              canModerate={isOwner || reply.author_id === userId}
              onDelete={() => {
                if (window.confirm(t('communities.moderation.deleteReplyConfirm'))) {
                  deleteReplyMutation.mutate(reply.id);
                }
              }}
              dateFormatter={dateFormatter}
            />
          ))}
          {replies.length === 0 && (
            <p className="rounded-2xl bg-surface-container px-4 py-4 font-sans text-body-sm text-on-surface-variant">
              {t('communities.forum.noReplies')}
            </p>
          )}
        </div>
      </main>

      {/* Composer fixo no rodapé */}
      <footer className="border-t border-outline-variant/30 bg-surface-container-lowest px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex w-full max-w-[640px] items-end gap-2">
          {canReply ? (
            <>
              <textarea
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                placeholder={t('communities.forum.replyPlaceholder')}
                aria-label={t('communities.forum.replyPlaceholder')}
                rows={1}
                maxLength={2000}
                className="max-h-32 min-h-11 w-full flex-1 resize-none rounded-xl border border-outline-variant/50 bg-surface-container-low px-3.5 py-2.5 font-sans text-body text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                disabled={!replyBody.trim() || replyMutation.isPending}
                onClick={() => void handleReply()}
                aria-label={t('communities.forum.send')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
              >
                {replyMutation.isPending ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden />
                ) : (
                  <Send size={18} aria-hidden />
                )}
              </button>
            </>
          ) : (
            <p className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface-container px-4 font-sans text-body-sm text-on-surface-variant">
              <Lock size={15} aria-hidden />
              {t('communities.forum.closedNotice')}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

function ModerationButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = 'neutral',
}: {
  icon: typeof Pin;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'error';
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60',
        tone === 'error'
          ? 'text-error hover:bg-error-container/40 focus-visible:ring-error'
          : 'text-on-surface-variant hover:bg-surface-container-high focus-visible:ring-primary',
      )}
    >
      <Icon size={15} aria-hidden />
      {label}
    </button>
  );
}

function ReplyCard({
  reply,
  canModerate,
  onDelete,
  dateFormatter,
}: {
  reply: Reply;
  canModerate: boolean;
  onDelete: () => void;
  dateFormatter: Intl.DateTimeFormat;
}) {
  const { t } = useTranslation();
  const name = reply.author?.full_name || reply.author?.username || t('communities.memberFallback');
  return (
    <article className="rounded-2xl bg-surface-container px-4 py-3">
      <div className="flex items-center gap-3">
        <MemberAvatar profile={reply.author} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-body font-medium text-on-surface">{name}</p>
          <p className="font-sans text-body-sm text-on-surface-variant">
            {dateFormatter.format(new Date(reply.created_at))}
          </p>
        </div>
        {canModerate && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={t('communities.moderation.deleteReply')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-error-container/40 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error"
          >
            <Trash2 size={16} aria-hidden />
          </button>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap font-sans text-body text-on-surface">{reply.body}</p>
    </article>
  );
}
