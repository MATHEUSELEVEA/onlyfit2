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
import type { FeedPost } from './types';
import { PostCaption } from './PostCaption';

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace('.0', '')}K`;
  return String(value);
}

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
      onClick={onClick}
      className="group flex min-h-[44px] min-w-[44px] flex-col items-center gap-1 text-white"
    >
      <span
        className={clsx(
          'flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-colors',
          active ? 'bg-primary/90 text-on-primary' : 'bg-white/15',
        )}
      >
        {children}
      </span>
      <span className="font-sans text-counter drop-shadow">{count ?? label}</span>
    </button>
  );
}

interface PostCardProps {
  post: FeedPost;
}

export function PostCard({ post }: PostCardProps) {
  // Estado otimista local por enquanto; persistência entra na próxima etapa.
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const likeCount = post.likeCount + (liked ? 1 : 0);
  const profileTo = `/creator/${encodeURIComponent(post.author.username)}`;

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
      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-4">
        <RailButton
          label="Curtir"
          count={formatCount(likeCount)}
          active={liked}
          onClick={() => setLiked((v) => !v)}
        >
          <Heart size={26} fill={liked ? 'currentColor' : 'none'} aria-hidden />
        </RailButton>
        <RailButton label="Comentar" count={formatCount(post.commentCount)}>
          <MessageCircle size={26} aria-hidden />
        </RailButton>
        <RailButton label="Salvar" active={saved} onClick={() => setSaved((v) => !v)}>
          <Bookmark size={26} fill={saved ? 'currentColor' : 'none'} aria-hidden />
        </RailButton>
        <RailButton label="Compartilhar">
          <Share2 size={26} aria-hidden />
        </RailButton>
      </div>

      {/* Área inferior: creator, legenda e banner de produto */}
      <div className="absolute bottom-0 left-0 z-10 flex w-full flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
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
                className="h-12 w-12 rounded-full border-2 border-primary object-cover"
              />
            ) : (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-surface-container-high font-sans text-title-lg text-on-surface"
                aria-hidden
              >
                {post.author.username.slice(0, 1).toUpperCase()}
              </div>
            )}
          </Link>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
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

            {/* Assinar (era PRO) + Seguir (era GRATUITO) — cores por token de tema */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSubscribed((v) => !v)}
                aria-pressed={subscribed}
                className={clsx(
                  'min-h-[34px] rounded-md px-4 font-sans text-label backdrop-blur-sm transition-colors',
                  subscribed
                    ? 'border border-white/40 bg-white/10 text-white'
                    : 'bg-primary text-on-primary',
                )}
              >
                {subscribed ? 'Assinado' : 'Assinar'}
              </button>
              <button
                type="button"
                onClick={() => setFollowing((v) => !v)}
                aria-pressed={following}
                className={clsx(
                  'min-h-[34px] rounded-md px-4 font-sans text-label backdrop-blur-sm transition-colors',
                  following
                    ? 'bg-white/25 text-white'
                    : 'border border-white/40 bg-white/10 text-white',
                )}
              >
                {following ? 'Seguindo' : 'Seguir'}
              </button>
            </div>
          </div>
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
    </article>
  );
}
