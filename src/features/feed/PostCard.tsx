import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  Bookmark,
  ChevronRight,
  Dumbbell,
  Heart,
  MessageCircle,
  Plus,
  Share2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { formatCount } from '@/lib/format';
import { publicAppUrl } from '@/lib/publicUrl';
import type { FeedAuthor, FeedPost } from './types';
import { PostMedia } from './PostMedia';
import { PostCaption } from './PostCaption';
import { CommentsSheet } from './CommentsSheet';
import { useToggleLike } from './useToggleLike';
import { useSavedPost } from './useSavedPost';
import { useCreatorFollowState, useToggleCreatorFollow } from '@/features/creators/useCreatorFollow';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// Janela do double-tap: dois toques dentro desse intervalo curtem o post.
const DOUBLE_TAP_MS = 300;

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
        'flex min-h-[48px] min-w-[48px] flex-col items-center gap-0.5 drop-shadow-lg transition-colors',
        active ? 'text-primary' : 'text-white',
      )}
    >
      <span className="flex items-center justify-center">{children}</span>
      {count && <span className="font-sans text-counter">{count}</span>}
    </button>
  );
}

interface RailAvatarProps {
  author: FeedAuthor;
  viewerId: string | undefined;
}

// Avatar do creator no topo do trilho, estilo TikTok: leva ao perfil e carrega
// o badge "+" de seguir, que some quando o usuário já segue ou o post é dele.
// Persiste em creator_follows pelos hooks compartilhados de creators.
function RailAvatar({ author, viewerId }: RailAvatarProps) {
  const isOwnPost = author.id === viewerId;
  const { data: following } = useCreatorFollowState(author.id);
  const toggleFollow = useToggleCreatorFollow(author.id);
  const profileTo = `/creator/${encodeURIComponent(author.username)}`;
  const showFollow = !isOwnPost && !following;

  return (
    <div className={clsx('relative', showFollow && 'mb-2')}>
      <Link
        to={profileTo}
        state={{ author }}
        aria-label={`Ver perfil de @${author.username}`}
        className="block drop-shadow-lg"
      >
        {author.avatarUrl ? (
          <img
            src={author.avatarUrl}
            alt=""
            className="h-11 w-11 rounded-full border-2 border-white/90 object-cover"
          />
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/90 bg-surface-container-high font-sans text-title text-on-surface"
            aria-hidden
          >
            {author.username.slice(0, 1).toUpperCase()}
          </div>
        )}
      </Link>
      {showFollow && (
        <button
          type="button"
          onClick={() => toggleFollow.mutate(true)}
          disabled={toggleFollow.isPending}
          aria-label={`Seguir @${author.username}`}
          className="absolute -bottom-3.5 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center disabled:opacity-50"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary">
            <Plus size={14} strokeWidth={3} aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}

interface PostCardProps {
  post: FeedPost;
}

export function PostCard({ post }: PostCardProps) {
  const { session } = useAuth();
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const lastTapRef = useRef(0);
  // Chave do coração do double-tap: um novo timestamp remonta a animação.
  const [heartBurst, setHeartBurst] = useState(0);

  // O feed mantém os posts vizinhos montados, então é a visibilidade — e não a
  // montagem — que decide qual vídeo toca. Sem isso os vizinhos tocam juntos.
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
  const shareUrl = publicAppUrl(`/video/${post.id}`);

  // Double-tap na mídia curte (nunca descurte), com o coração animado do
  // TikTok. Toques em botões (som, pontinhos) não contam para o gesto.
  const handleMediaTap = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      if (!post.likedByMe) toggleLike.mutate({ postId: post.id, liked: post.likedByMe });
      setHeartBurst(now);
    } else {
      lastTapRef.current = now;
    }
  };

  return (
    <article
      ref={articleRef}
      className="relative mx-auto h-full overflow-hidden bg-surface-container-lowest feed-stage"
    >
      {/* Mídia de fundo: vídeo, imagem única ou carrossel (imagem e/ou vídeo) */}
      <div className="absolute inset-0" onClick={handleMediaTap}>
        <PostMedia
          media={post.media}
          alt={post.caption || `Post de @${post.author.username}`}
          active={inView}
        />
      </div>

      {/* Gradiente para legibilidade do texto sobre a mídia */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.05) 55%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* Coração do double-tap */}
      {heartBurst > 0 && (
        <div
          key={heartBurst}
          onAnimationEnd={() => setHeartBurst(0)}
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <Heart size={96} className="animate-heart-burst fill-primary text-primary drop-shadow-lg" aria-hidden />
        </div>
      )}

      {/* Zona inferior: meta (creator, legenda, produto) e trilho de ações lado
          a lado, alinhados pelo fundo. A legenda expande e empurra a própria
          coluna para cima; o trilho acompanha sem transform nem medição. */}
      <div className="absolute inset-x-0 z-10 feed-bottom-zone">
        <div className="flex items-end gap-2 px-3">
          <div className="flex min-w-0 flex-1 flex-col gap-3 pb-1">
            <Link
              to={profileTo}
              state={{ author: post.author }}
              className="flex min-w-0 items-center gap-1.5 self-start"
            >
              <span className="truncate font-sans text-handle text-white drop-shadow">
                @{post.author.username}
              </span>
              {post.author.verified && (
                <BadgeCheck size={18} className="shrink-0 text-primary" aria-label="Verificado" />
              )}
            </Link>

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

          {/* Trilho de ações: avatar+seguir, curtir, comentar, salvar,
              compartilhar — tudo a um toque, como no TikTok. */}
          <div className="flex w-12 shrink-0 flex-col items-center feed-actions-rail">
            <RailAvatar author={post.author} viewerId={session?.user.id} />
            <RailButton
              label="Curtir"
              count={formatCount(post.likeCount)}
              active={post.likedByMe}
              onClick={() => toggleLike.mutate({ postId: post.id, liked: post.likedByMe })}
            >
              <Heart className="feed-rail-icon" fill={post.likedByMe ? 'currentColor' : 'none'} aria-hidden />
            </RailButton>
            {!post.commentsDisabled && (
              <RailButton
                label="Comentar"
                count={formatCount(post.commentCount)}
                onClick={() => setCommentsPostId(post.id)}
              >
                <MessageCircle className="feed-rail-icon" aria-hidden />
              </RailButton>
            )}
            <RailButton label={saved ? 'Remover dos salvos' : 'Salvar'} active={saved} onClick={toggleSaved}>
              <Bookmark className="feed-rail-icon" fill={saved ? 'currentColor' : 'none'} aria-hidden />
            </RailButton>
            <RailButton label="Compartilhar" onClick={() => setShareOpen(true)}>
              <Share2 className="feed-rail-icon" aria-hidden />
            </RailButton>
          </div>
        </div>
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
