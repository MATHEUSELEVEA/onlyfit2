import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CirclePlus,
  Heart,
  Loader2,
  MessageCircle,
  MessageCircleOff,
  MoreHorizontal,
  PencilLine,
  Play,
  Share2,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { formatCount } from '@/lib/format';
import { publicAppOrigin, publicAppUrl } from '@/lib/publicUrl';
import { useTranslation } from '@/i18n/I18nProvider';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ShareSheet } from '@/components/ui/ShareSheet';
import {
  useDeleteMyPost,
  useMyPosts,
  useToggleMyPostComments,
  useUpdateMyPostCaption,
  type MyPost,
} from './useMyPosts';

type SheetMode = 'menu' | 'edit' | 'share' | 'delete';

// Aba Feed do perfil próprio: grade dos posts do usuário, cada um com o menu
// de três pontinhos (alterar texto, compartilhar, comentários, excluir).
export function MyPostsTab({ username }: { username: string | null }) {
  const { t } = useTranslation();
  const { data: posts, isLoading, isError, refetch } = useMyPosts();
  const [activePost, setActivePost] = useState<MyPost | null>(null);
  const [mode, setMode] = useState<SheetMode | null>(null);

  // O sheet trabalha com a versão mais fresca do post (após toggles/edições).
  const currentPost = activePost ? (posts?.find((p) => p.id === activePost.id) ?? null) : null;

  function openMenu(post: MyPost) {
    setActivePost(post);
    setMode('menu');
  }

  function closeAll() {
    setActivePost(null);
    setMode(null);
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-lg bg-surface-container" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="font-sans text-body text-on-surface-variant">{t('profile.myPosts.loadError')}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="min-h-[40px] rounded-full border border-outline-variant/60 px-5 font-sans text-label text-on-surface"
        >
          {t('profile.myPosts.retry')}
        </button>
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-outline-variant/40 bg-surface-container-low px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CirclePlus size={26} aria-hidden />
        </div>
        <p className="font-sans text-title text-on-surface">{t('profile.myPosts.empty')}</p>
        <p className="max-w-xs font-sans text-body text-on-surface-variant">
          {t('profile.myPosts.emptyHint')}
        </p>
        <Link
          to="/studio"
          className="mt-1 inline-flex min-h-[44px] items-center rounded-full bg-primary px-6 font-sans text-label text-on-primary shadow-sm active:scale-[0.98]"
        >
          {t('profile.myPosts.createFirst')}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {posts.map((post) => (
          <div key={post.id} className="relative aspect-square overflow-hidden rounded-lg bg-surface-container">
            <Link
              to={`/video/${encodeURIComponent(post.id)}`}
              aria-label={post.caption || t('profile.myPosts.viewPost')}
              className="block h-full w-full"
            >
              {post.thumbnailUrl ? (
                <img src={post.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-container-high to-surface-container text-on-surface-variant">
                  <Play size={30} aria-hidden />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
                <span className="flex items-center gap-1">
                  <Heart size={12} className="text-white" fill="currentColor" aria-hidden />
                  <span className="font-sans text-counter text-white">{formatCount(post.likes)}</span>
                </span>
                {post.commentsDisabled && (
                  <MessageCircleOff
                    size={12}
                    className="text-white"
                    aria-label={t('profile.myPosts.commentsOff')}
                  />
                )}
              </div>
            </Link>
            <button
              type="button"
              aria-label={t('profile.myPosts.options')}
              onClick={() => openMenu(post)}
              className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] transition-transform active:scale-95"
            >
              <MoreHorizontal size={20} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      {currentPost && mode === 'menu' && (
        <PostActionsSheet
          post={currentPost}
          onClose={closeAll}
          onEdit={() => setMode('edit')}
          onShare={() => setMode('share')}
          onDelete={() => setMode('delete')}
        />
      )}
      {currentPost && mode === 'edit' && <EditCaptionSheet post={currentPost} onClose={closeAll} />}
      {currentPost && mode === 'delete' && <DeletePostSheet post={currentPost} onClose={closeAll} />}
      <ShareSheet
        open={Boolean(currentPost && mode === 'share')}
        onClose={closeAll}
        url={currentPost ? publicAppUrl(`/video/${currentPost.id}`) : publicAppOrigin()}
        text={username ? `Veja este post de @${username} no OnlyFit` : 'Veja este post no OnlyFit'}
      />
    </>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
  pending,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  pending?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex min-h-[60px] w-full items-center gap-4 border-b border-outline-variant/20 px-3 py-3 text-left last:border-b-0 active:bg-surface-container disabled:opacity-60"
    >
      <span
        className={clsx(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
          destructive ? 'bg-error-container text-on-error-container' : 'bg-primary/10 text-primary',
        )}
      >
        {pending ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <Icon size={20} aria-hidden />}
      </span>
      <span
        className={clsx(
          'min-w-0 flex-1 font-sans text-body font-medium',
          destructive ? 'text-error' : 'text-on-surface',
        )}
      >
        {label}
      </span>
    </button>
  );
}

function PostActionsSheet({
  post,
  onClose,
  onEdit,
  onShare,
  onDelete,
}: {
  post: MyPost;
  onClose: () => void;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const toggleComments = useToggleMyPostComments();

  return (
    <BottomSheet open onClose={onClose} title={t('profile.myPosts.options')}>
      <div className="px-5 pb-6 pt-1">
        <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface/40">
          <ActionRow icon={PencilLine} label={t('profile.myPosts.edit.title')} onClick={onEdit} />
          <ActionRow icon={Share2} label={t('profile.myPosts.share')} onClick={onShare} />
          <ActionRow
            icon={post.commentsDisabled ? MessageCircle : MessageCircleOff}
            label={
              post.commentsDisabled
                ? t('profile.myPosts.enableComments')
                : t('profile.myPosts.disableComments')
            }
            pending={toggleComments.isPending}
            onClick={() => toggleComments.mutate({ post, disabled: !post.commentsDisabled })}
          />
          <ActionRow icon={Trash2} label={t('profile.myPosts.delete')} onClick={onDelete} destructive />
        </div>
        {toggleComments.isError && (
          <p className="mt-3 px-1 font-sans text-body-sm text-error">{t('profile.myPosts.error')}</p>
        )}
      </div>
    </BottomSheet>
  );
}

function EditCaptionSheet({ post, onClose }: { post: MyPost; onClose: () => void }) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState(post.caption);
  const updateCaption = useUpdateMyPostCaption();

  async function handleSave() {
    if (updateCaption.isPending) return;
    try {
      await updateCaption.mutateAsync({ postId: post.id, caption });
      onClose();
    } catch {
      // Erro fica visível no aviso abaixo; o sheet permanece aberto.
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('profile.myPosts.edit.title')}
      description={t('profile.myPosts.edit.description')}
    >
      <div className="flex flex-col gap-3 px-5 pb-6 pt-1">
        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder={t('profile.myPosts.edit.placeholder')}
          maxLength={2000}
          rows={5}
          autoFocus
          className="w-full resize-none rounded-xl border border-outline-variant/40 bg-surface px-4 py-3 font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {updateCaption.isError && (
          <p className="font-sans text-body-sm text-error">{t('profile.myPosts.error')}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-full border border-outline-variant/60 font-sans text-label text-on-surface active:bg-surface-container"
          >
            {t('profile.myPosts.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={updateCaption.isPending}
            className="min-h-[44px] flex-1 rounded-full bg-primary font-sans text-label text-on-primary shadow-sm active:scale-[0.98] disabled:opacity-60"
          >
            {updateCaption.isPending ? t('profile.myPosts.edit.saving') : t('profile.myPosts.edit.save')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function DeletePostSheet({ post, onClose }: { post: MyPost; onClose: () => void }) {
  const { t } = useTranslation();
  const deletePost = useDeleteMyPost();

  async function handleDelete() {
    if (deletePost.isPending) return;
    try {
      await deletePost.mutateAsync(post.id);
      onClose();
    } catch {
      // Erro fica visível no aviso abaixo; o sheet permanece aberto.
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('profile.myPosts.delete.confirmTitle')}
      description={t('profile.myPosts.delete.confirmDescription')}
    >
      <div className="flex flex-col gap-3 px-5 pb-6 pt-2">
        {deletePost.isError && (
          <p className="font-sans text-body-sm text-error">{t('profile.myPosts.error')}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-full border border-outline-variant/60 font-sans text-label text-on-surface active:bg-surface-container"
          >
            {t('profile.myPosts.cancel')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deletePost.isPending}
            className="min-h-[44px] flex-1 rounded-full bg-error font-sans text-label text-on-error shadow-sm active:scale-[0.98] disabled:opacity-60"
          >
            {deletePost.isPending
              ? t('profile.myPosts.delete.deleting')
              : t('profile.myPosts.delete.confirm')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
