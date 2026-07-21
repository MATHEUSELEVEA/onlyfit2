import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PostMedia } from '@/features/feed/PostMedia';
import { StoryProgressRing } from './StoryProgressRing';
import { useStoryTimeProgress } from './useStoryTimeProgress';
import type { StoryFeedItem } from './types';

interface StoryCardProps {
  story: StoryFeedItem;
}

const RING_SIZE = 44;

// Card de Story dentro do feed principal — mesmo palco em tela cheia que um
// post tem (PostMedia, gradiente, nome do criador), mas sem o trilho de
// curtir/comentar/salvar/compartilhar (Story não tem esses dados no banco, e
// o produto pediu conteúdo efêmero sem interação pública). A única marca
// visual de que é um Story é o relógio de tempo restante ao redor do avatar.
export function StoryCard({ story }: StoryCardProps) {
  const articleRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const progress = useStoryTimeProgress(story.createdAt, story.expiresAt);

  // Mesmo padrão de PostCard: só o card visível toca o vídeo.
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.6,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const profileTo = `/creator/${encodeURIComponent(story.username)}`;

  return (
    <article
      ref={articleRef}
      className="relative mx-auto h-full overflow-hidden bg-surface-container-lowest feed-stage"
    >
      <div className="absolute inset-0">
        <PostMedia
          media={[{ kind: story.mediaType, url: story.mediaUrl, thumbnailUrl: story.thumbnailUrl }]}
          alt={`Story de @${story.username}`}
          active={inView}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.05) 55%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      <div className="absolute inset-x-0 z-10 flex items-center gap-2 px-3 feed-bottom-zone">
        <div className="relative flex shrink-0 items-center justify-center" style={{ width: RING_SIZE, height: RING_SIZE }}>
          <StoryProgressRing progress={progress} size={RING_SIZE} />
          <span className="absolute flex h-8 w-8 items-center justify-center overflow-hidden rounded-full">
            {story.avatarUrl ? (
              <img src={story.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-surface-container-high font-sans text-label text-on-surface">
                {story.username.slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>
        </div>

        <Link to={profileTo} state={{ author: { username: story.username } }} className="min-w-0">
          <span className="truncate font-sans text-handle text-white drop-shadow">
            @{story.username}
          </span>
        </Link>
      </div>
    </article>
  );
}
