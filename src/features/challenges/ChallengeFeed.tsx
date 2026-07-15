import { useState } from 'react';
import { clsx } from 'clsx';
import { Camera, CheckCircle2, Heart, Loader2, MessageCircle, Send, Trash2 } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { uploadAsset } from '@/features/studio/upload';
import {
  useAddChallengeComment,
  useChallengeComments,
  useChallengeFeed,
  useCreateChallengePost,
  useDeleteChallengeComment,
  useRemoveChallengePost,
  useToggleChallengeLike,
} from './useChallengeFeed';
import { displayName } from './format';
import type { ChallengeFeedPost, ChallengeProfile, ChallengeRun } from './types';

const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function ChallengeFeed({
  run,
  userId,
  isParticipant,
  isOwner,
}: {
  run: ChallengeRun;
  userId: string | undefined;
  isParticipant: boolean;
  isOwner: boolean;
}) {
  const { t } = useTranslation();
  const feed = useChallengeFeed(run.id, userId);
  const createPost = useCreateChallengePost(run.id, userId);
  const toggleLike = useToggleChallengeLike(run.id, userId);
  const removePost = useRemoveChallengePost(run.id);
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [commentsFor, setCommentsFor] = useState<ChallengeFeedPost | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handlePickImage(file: File | undefined) {
    if (!file) return;
    setFeedback(null);
    setUploading(true);
    try {
      const url = await uploadAsset(file, `challenge-post-${Date.now()}.jpg`, file.type || 'image/jpeg', 'onlyfit-media');
      setImageUrl(url);
    } catch {
      setFeedback(t('challenges.form.imageError'));
    } finally {
      setUploading(false);
    }
  }

  async function handlePublish() {
    if (!text.trim() && !imageUrl) return;
    setFeedback(null);
    try {
      await createPost.mutateAsync({ text: text.trim(), imageUrl });
      setText('');
      setImageUrl(null);
    } catch {
      setFeedback(t('challenges.feed.publishError'));
    }
  }

  const posts = feed.data ?? [];

  return (
    <div className="space-y-4">
      {(isParticipant || isOwner) && (
        <div className="space-y-3 rounded-2xl bg-surface-container p-4">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={1000}
            rows={2}
            placeholder={t('challenges.feed.composerPlaceholder')}
            aria-label={t('challenges.feed.composerPlaceholder')}
            className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low p-3.5 font-sans text-body text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {imageUrl && <img src={imageUrl} alt="" className="max-h-44 rounded-xl object-cover" />}
          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-surface-container-high px-3.5 font-sans text-label text-on-surface-variant transition-colors hover:bg-surface-container-highest">
              <Camera size={16} aria-hidden />
              {t('challenges.feed.addPhoto')}
              <input type="file" accept="image/*" className="hidden" onChange={(event) => void handlePickImage(event.target.files?.[0])} />
            </label>
            <button
              type="button"
              disabled={createPost.isPending || uploading || (!text.trim() && !imageUrl)}
              onClick={() => void handlePublish()}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 font-sans text-label text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {(createPost.isPending || uploading) && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {t('challenges.feed.publish')}
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <p role="alert" className="font-sans text-body-sm text-error">
          {feedback}
        </p>
      )}

      {feed.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={24} className="animate-spin text-primary" aria-label={t('challenges.loading')} />
        </div>
      ) : posts.length === 0 ? (
        <p className="rounded-2xl bg-surface-container px-4 py-6 font-sans text-body-sm text-on-surface-variant">
          {t('challenges.feed.empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              canModerate={isOwner || post.user_id === userId}
              onLike={() => toggleLike.mutate({ logId: post.id, liked: post.liked_by_me })}
              onComments={() => setCommentsFor(post)}
              onRemove={() => {
                if (window.confirm(t('challenges.feed.removeConfirm'))) removePost.mutate(post.id);
              }}
            />
          ))}
        </div>
      )}

      <CommentsSheet
        run={run}
        userId={userId}
        post={commentsFor}
        isOwner={isOwner}
        canComment={isParticipant || isOwner}
        onClose={() => setCommentsFor(null)}
      />
    </div>
  );
}

function Avatar({ profile }: { profile: ChallengeProfile | null }) {
  const initial = (profile?.full_name || profile?.username || '?').charAt(0).toUpperCase();
  return profile?.avatar_url ? (
    <img src={profile.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container-high font-sans text-label text-on-surface-variant">
      {initial}
    </span>
  );
}

function PostCard({
  post,
  canModerate,
  onLike,
  onComments,
  onRemove,
}: {
  post: ChallengeFeedPost;
  canModerate: boolean;
  onLike: () => void;
  onComments: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const isCheckin = post.payload_json?.source === 'task_completion';
  const author = displayName(post.profile, t('challenges.feed.participantFallback'));

  return (
    <article className="space-y-3 rounded-2xl bg-surface-container p-4">
      <div className="flex items-center gap-3">
        <Avatar profile={post.profile} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-body font-medium text-on-surface">{author}</p>
          <p className="font-sans text-body-sm text-on-surface-variant">{TIME_FORMAT.format(new Date(post.logged_at))}</p>
        </div>
        {canModerate && (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={t('challenges.feed.remove')}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        )}
      </div>

      {isCheckin && (
        <p className="flex items-center gap-1.5 font-sans text-body-sm text-primary">
          <CheckCircle2 size={15} aria-hidden />
          {t('challenges.feed.checkin').replace('{task}', post.title ?? '')}
        </p>
      )}
      {post.text_content && <p className="whitespace-pre-wrap font-sans text-body text-on-surface">{post.text_content}</p>}
      {post.evidence_url && <img src={post.evidence_url} alt="" loading="lazy" className="max-h-80 w-full rounded-xl object-cover" />}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onLike}
          aria-pressed={post.liked_by_me}
          className={clsx(
            'inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            post.liked_by_me ? 'text-error' : 'text-on-surface-variant hover:text-on-surface',
          )}
        >
          <Heart size={17} fill={post.liked_by_me ? 'currentColor' : 'none'} aria-hidden />
          {post.like_count > 0 && post.like_count}
          <span className="sr-only">{t('challenges.feed.like')}</span>
        </button>
        <button
          type="button"
          onClick={onComments}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 font-sans text-label text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MessageCircle size={17} aria-hidden />
          {post.comment_count > 0 && post.comment_count}
          <span className="sr-only">{t('challenges.feed.comments')}</span>
        </button>
      </div>
    </article>
  );
}

function CommentsSheet({
  run,
  userId,
  post,
  isOwner,
  canComment,
  onClose,
}: {
  run: ChallengeRun;
  userId: string | undefined;
  post: ChallengeFeedPost | null;
  isOwner: boolean;
  canComment: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const comments = useChallengeComments(run.id, post?.id ?? null);
  const addComment = useAddChallengeComment(run.id, userId);
  const deleteComment = useDeleteChallengeComment(run.id);
  const [body, setBody] = useState('');

  async function handleSend() {
    if (!post || !body.trim()) return;
    await addComment.mutateAsync({ logId: post.id, body: body.trim() });
    setBody('');
  }

  return (
    <BottomSheet open={Boolean(post)} onClose={onClose} title={t('challenges.feed.comments')} panelClassName="h-[70vh]">
      <div className="flex h-full flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-3">
          {comments.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-primary" aria-hidden />
            </div>
          ) : (comments.data ?? []).length === 0 ? (
            <p className="py-6 font-sans text-body-sm text-on-surface-variant">{t('challenges.feed.noComments')}</p>
          ) : (
            (comments.data ?? []).map((comment) => (
              <div key={comment.id} className="flex items-start gap-2.5">
                <Avatar profile={comment.profile} />
                <div className="min-w-0 flex-1 rounded-xl bg-surface-container px-3 py-2">
                  <p className="font-sans text-body-sm font-medium text-on-surface">
                    {displayName(comment.profile, t('challenges.feed.participantFallback'))}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap font-sans text-body-sm text-on-surface">{comment.body}</p>
                </div>
                {(isOwner || comment.user_id === userId) && post && (
                  <button
                    type="button"
                    onClick={() => deleteComment.mutate({ commentId: comment.id, logId: post.id })}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-error"
                    aria-label={t('challenges.feed.removeComment')}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        {canComment && (
          <div className="flex items-center gap-2 border-t border-outline-variant/30 px-4 py-3">
            <input
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              maxLength={500}
              placeholder={t('challenges.feed.commentPlaceholder')}
              aria-label={t('challenges.feed.commentPlaceholder')}
              className="min-h-11 w-full flex-1 rounded-full border border-outline-variant/50 bg-surface-container-low px-4 font-sans text-body text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              disabled={addComment.isPending || !body.trim()}
              onClick={() => void handleSend()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
              aria-label={t('challenges.feed.send')}
            >
              <Send size={17} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
