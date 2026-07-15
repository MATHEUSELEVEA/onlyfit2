import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Bookmark,
  ChevronRight,
  CirclePlus,
  Dumbbell,
  Heart,
  MessageCircle,
  Share2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { formatCount } from '@/lib/format';
import type { FeedPost } from './types';
import { PostMedia } from './PostMedia';
import { PostCaption } from './PostCaption';
import { CommentsSheet } from './CommentsSheet';
import { useToggleLike } from './useToggleLike';
import { useSavedPost } from './useSavedPost';
import { useCreatorFollowState, useToggleCreatorFollow } from '@/features/creators/useCreatorFollow';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

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
  viewerId: string | undefined;
}

// Botão "Seguir" no estilo do reels do Instagram: pílula translúcida sobre a
// mídia, some quando o usuário já segue o creator ou quando o post é próprio.
// Persiste em creator_follows pelos hooks compartilhados de creators.
function FollowButton({ creatorId, viewerId }: FollowButtonProps) {
  const isOwnPost = creatorId === viewerId;
  const { data: following } = useCreatorFollowState(creatorId);
  const toggleFollow = useToggleCreatorFollow(creatorId);

  if (isOwnPost || following) return null;

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
  const { session } = useAuth();
  const navigate = useNavigate();
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const [captionLift, setCaptionLift] = useState(0);

  // O feed mantém todos os posts carregados montados, então é a visibilidade —
  // e não a montagem — que decide qual vídeo toca. Sem isso todos tocam juntos.
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.6,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggleLike = useToggleLike();
  const { saved, toggleSaved } = useSavedPost(post.id);

  const profileTo = `/creator/${encodeURIComponent(post.author.username)}`;
  const shareUrl = `${window.location.origin}/video/${post.id}`;

  return (
    <article
      ref={articleRef}
      className="relative mx-auto h-full overflow-hidden bg-surface-container-lowest feed-stage"
    >
      {/* Mídia de fundo: vídeo, imagem única ou carrossel (imagem e/ou vídeo) */}
      <PostMedia
        media={post.media}
        alt={post.caption || `Post de @${post.author.username}`}
        active={inView}
      />

      {/* Gradiente para legibilidade do texto sobre a mídia */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.05) 55%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* Trilho de ações à direita. Fica acima do bloco de legenda (que é
          largura cheia e cresce para cima) para continuar clicável, e sobe junto
          quando a legenda expande. */}
      <div
        className="absolute right-3 z-20 flex flex-col items-center gap-5 feed-actions-rail transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `translateY(${-captionLift}px)` }}
      >
        <RailButton
          label="Curtir"
          count={formatCount(post.likeCount)}
          active={post.likedByMe}
          onClick={() => toggleLike.mutate({ postId: post.id, liked: post.likedByMe })}
        >
          <Heart size={22} fill={post.likedByMe ? 'currentColor' : 'none'} aria-hidden />
        </RailButton>
        {!post.commentsDisabled && (
          <RailButton
            label="Comentar"
            count={formatCount(post.commentCount)}
            onClick={() => setCommentsPostId(post.id)}
          >
            <MessageCircle size={22} aria-hidden />
          </RailButton>
        )}
        <RailButton label="Salvar" active={saved} onClick={toggleSaved}>
          <Bookmark size={22} fill={saved ? 'currentColor' : 'none'} aria-hidden />
        </RailButton>
        <RailButton label="Compartilhar" onClick={() => setShareOpen(true)}>
          <Share2 size={22} aria-hidden />
        </RailButton>
        <RailButton label="Criar post" onClick={() => navigate('/studio')}>
          <CirclePlus size={22} aria-hidden />
        </RailButton>
      </div>

      {/* Área inferior: creator, legenda e banner de produto */}
      <div className="absolute left-0 z-10 flex w-full flex-col gap-3 p-4 feed-post-meta">
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

          <FollowButton creatorId={post.author.id} viewerId={session?.user.id} />
        </div>

        <PostCaption text={post.caption} onLiftChange={setCaptionLift} />

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
        onShared={() => {
          if (!session?.user.id) return;
          void supabase.from('feed_post_events').insert({
            user_id: session.user.id,
            post_id: post.id,
            event_type: 'share',
          });
        }}
      />
    </article>
  );
}
