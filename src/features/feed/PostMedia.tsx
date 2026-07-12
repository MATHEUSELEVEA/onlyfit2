import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type { FeedMedia } from './types';

// Uma página de mídia (vídeo ou imagem) preenchendo o card em tela cheia,
// mantendo a mesma proporção do feed (object-cover). Vídeo só toca quando é a
// página ativa do carrossel — imagens são estáticas.
function MediaSlide({ media, active, alt }: { media: FeedMedia; active: boolean; alt: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active]);

  if (media.kind === 'video') {
    return (
      <video
        ref={videoRef}
        src={media.url}
        poster={media.thumbnailUrl ?? undefined}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        loop
        playsInline
        autoPlay={active}
      />
    );
  }

  return (
    <img
      src={media.url}
      alt={alt}
      className="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
    />
  );
}

interface PostMediaProps {
  media: FeedMedia[];
  alt: string;
}

// Camada de fundo do PostCard. Decide sozinho entre mídia única e carrossel:
// media.length > 1 vira um pager horizontal com snap e pontinhos flutuantes.
export function PostMedia({ media, alt }: PostMediaProps) {
  const [index, setIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (media.length === 0) {
    return <div className="absolute inset-0 bg-surface-container" />;
  }

  if (media.length === 1) {
    return <MediaSlide media={media[0]} active alt={alt} />;
  }

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const current = Math.round(el.scrollLeft / el.clientWidth);
    if (current !== index) setIndex(current);
  };

  return (
    <>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
      >
        {media.map((item, i) => (
          <div
            key={i}
            className="relative h-full w-full shrink-0 snap-start snap-always"
          >
            <MediaSlide media={item} active={i === index} alt={`${alt} (${i + 1}/${media.length})`} />
          </div>
        ))}
      </div>

      {/* Pontinhos flutuantes sobre a mídia indicando a página do carrossel */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-safe-top">
        <div className="mt-14 flex items-center gap-1.5 rounded-full bg-black/25 px-2 py-1 backdrop-blur-sm">
          {media.map((_, i) => (
            <span
              key={i}
              className={clsx(
                'h-1.5 rounded-full transition-all',
                i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50',
              )}
            />
          ))}
        </div>
      </div>
    </>
  );
}
