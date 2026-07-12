import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  Bookmark,
  ChevronRight,
  Dumbbell,
  Heart,
  MessageCircle,
  Share2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { formatCount } from '@/lib/format';
import type { FeedPost } from './types';
import { PostCaption } from './PostCaption';
import { CommentsSheet } from './CommentsSheet';
import { useToggleLike } from './useToggleLike';
import { useSavedPost } from './useSavedPost';
import { useCreatorFollowState, useToggleCreatorFollow } from '@/features/creators/useCreatorFollow';

interface RailButtonProps {
  label: string;
  count?: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

function RailButton({ label, count, active, onClick, children }: RailButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'group flex min-h-[44px] min-w-[44px] flex-col items-center gap-0.5 drop-shadow-lg transition-colors',
        active ? 'text-primary' : 'text-white',
      )}
    >
      <span className="flex items-center justify-center">{children}</span>
      {count && <span className="font-sans text-counter">{count}</span>}
    </button>
  );
}

interface FollowButtonProps {
  creatorId: string;
}

// Botão "Seguir" no estilo do reels do Instagram: pílula translúcida sobre a
// mídia, some quando o usuário já segue o creator. Persiste em creator_follows
// pelos hooks compartilhados de creators.
function FollowButton({ creatorId }: FollowButtonProps) {
  const { data: following } = useCreatorFollowState(creatorId);
  const toggleFollow = useToggleCreatorFollow(creatorId);

  if (following) return null;

  return (
    <button
      type="button"
      onClick={() => toggleFollow.mutate(true)}
      disabled={toggleFollow.isPending}
      className="shrink-0 rounded-full border border-white/80 px-3 py-1 font-sans text-label text-white drop-shadow transition-opacity active:opacity-70 disabled:opacity-50"
    >
      Seguir
    </button>
  );
}

interface PostCardProps {
  post: FeedPost;
}

export function PostCard({ post }: PostCardProps) {
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const toggleLike = useToggleLike();
  const { saved, toggleSaved } = useSavedPost(post.id);

  const profileTo = `/creator/${encodeURIComponent(post.author.username)}`;
  // Rota de detalhe do post ainda não existe no v2; o link já nasce no
  // formato do v1 (/post/:id) para continuar válido quando ela chegar.
  const shareUrl = `${window.location.origin}/post/${post.id}`;

  return (
    <article className="relative h-full w-full overflow-hidden bg-surface-container-lowest">
      {/* Mídia de fundo (foto ou vídeo) */}
      {post.mediaType === 'video' && post.mediaUrl ? (
        <video
          src={post.mediaUrl}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
      ) : post.mediaUrl ? (
        <img
          src={post.mediaUrl}
          alt={post.caption || `Post de @${post.author.username}`}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-surface-container" />
      )}

      {/* Gradiente para legibilidade do texto sobre a mídia */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.05) 55%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* Trilho de ações à direita */}
      <div className="absolute bottom-40 right-3 z-10 flex flex-col items-center gap-5">
        <RailButton
          label="Curtir"
          count={formatCount(post.likeCount)}
          active={post.likedByMe}
          onClick={() => toggleLike.mutate({ postId: post.id, liked: post.likedByMe })}
        >
          <Heart size={22} fill={post.likedByMe ? 'currentColor' : 'none'} aria-hidden />
        </RailButton>
        <RailButton
          label="Comentar"
          count={formatCount(post.commentCount)}
          onClick={() => setCommentsPostId(post.id)}
        >
          <MessageCircle size={22} aria-hidden />
        </RailButton>
        <RailButton label="Salvar" active={saved} onClick={toggleSaved}>
          <Bookmark size={22} fill={saved ? 'currentColor' : 'none'} aria-hidden />
        </RailButton>
        <RailButton label="Compartilhar" onClick={() => setShareOpen(true)}>
          <Share2 size={22} aria-hidden />
        </RailButton>
      </div>

      {/* Área inferior: creator, legenda e banner de produto */}
      <div className="absolute bottom-0 left-0 z-10 flex w-full flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <Link
            to={profileTo}
            state={{ author: post.author }}
            aria-label={`Ver perfil de @${post.author.username}`}
            className="shrink-0"
          >
            {post.author.avatarUrl ? (
              <img
                src={post.author.avatarUrl}
                alt={`Avatar de @${post.author.username}`}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high font-sans text-title-lg text-on-surface"
                aria-hidden
              >
                {post.author.username.slice(0, 1).toUpperCase()}
              </div>
            )}
          </Link>

          <Link
            to={profileTo}
            state={{ author: post.author }}
            className="flex min-w-0 items-center gap-1.5"
          >
            <span className="truncate font-sans text-handle text-white drop-shadow">
              @{post.author.username}
            </span>
            {post.author.verified && (
              <BadgeCheck size={18} className="shrink-0 text-primary" aria-label="Verificado" />
            )}
          </Link>

          <FollowButton creatorId={post.author.id} />
        </div>

        <PostCaption text={post.caption} />

        {post.product && (
          <button
            type="button"
            className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-lg bg-primary px-4 py-3 text-on-primary transition-opacity active:opacity-90"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Dumbbell size={20} aria-hidden />
              <span className="truncate font-sans text-label">{post.product.title}</span>
            </span>
            <ChevronRight size={20} aria-hidden />
          </button>
        )}
      </div>

      <CommentsSheet postId={commentsPostId} onClose={() => setCommentsPostId(null)} />
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={shareUrl}
        text={`Veja este post de @${post.author.username} no OnlyFit`}
      />
    </article>
  );
}
