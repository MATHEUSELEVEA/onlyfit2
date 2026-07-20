import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { clsx } from 'clsx';
import type { FeedMedia } from './types';
import { muteAfterAutoplayBlock, setVideoMuted, useVideoMuted } from './videoSound';

type MediaFit = 'cover' | 'contain';

// Quanto a proporção da mídia pode fugir da do palco antes de `object-cover`
// cortar demais. 1.3 mantém o vertical (9:16) preenchendo a tela em qualquer
// celular e manda paisagem/quadrado para o `object-contain`.
const COVER_TOLERANCE = 1.3;

// Enquadramento: preencher só quando a mídia tem proporção parecida com a do
// palco — que muda com o aparelho (celular, tablet, janela do desktop). Fora
// disso a mídia aparece inteira sobre um fundo desfocado, como no Reels.
function fitFor(mediaAspect: number, stage: HTMLElement): MediaFit {
  const stageAspect = stage.clientWidth / stage.clientHeight;
  if (!mediaAspect || !stageAspect) return 'cover';
  const ratio = mediaAspect / stageAspect;
  return Math.max(ratio, 1 / ratio) <= COVER_TOLERANCE ? 'cover' : 'contain';
}

// Uma página de mídia (vídeo ou imagem) preenchendo o card em tela cheia.
// Vídeo só toca quando é a página ativa do carrossel — imagens são estáticas.
function MediaSlide({ media, active, alt }: { media: FeedMedia; active: boolean; alt: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const aspectRef = useRef(0);
  const [fit, setFit] = useState<MediaFit>('cover');
  // Fração assistida do vídeo (0..1), para a barra fina sobre a nav.
  const [progress, setProgress] = useState(0);
  const muted = useVideoMuted();

  const applyFit = useCallback((mediaAspect?: number) => {
    if (mediaAspect) aspectRef.current = mediaAspect;
    const stage = stageRef.current;
    if (!stage || !aspectRef.current) return;
    setFit(fitFor(aspectRef.current, stage));
  }, []);

  // Rotação de tela ou redimensionamento da janela mudam a proporção do palco,
  // então o enquadramento é recalculado.
  useEffect(() => {
    const onResize = () => applyFit();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyFit]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active) {
      video.pause();
      return;
    }
    video.muted = muted;
    void video.play().catch(() => {
      // iOS/Safari bloqueiam autoplay com áudio sem gesto do usuário: este
      // vídeo cai para mudo e toca assim mesmo, em vez de ficar parado. O mudo
      // só sobe para a preferência global se o usuário ainda não escolheu.
      video.muted = true;
      muteAfterAutoplayBlock();
      void video.play().catch(() => {});
    });
  }, [active, muted]);

  const backdropUrl = media.kind === 'image' ? media.url : media.thumbnailUrl;
  const mediaClass = clsx('relative h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain');

  return (
    <div ref={stageRef} className="absolute inset-0 overflow-hidden bg-surface-container-lowest">
      {/* Fundo desfocado preenche as bordas quando a mídia não é vertical */}
      {fit === 'contain' && backdropUrl && (
        <img
          src={backdropUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl"
        />
      )}

      {media.kind === 'video' ? (
        <video
          ref={videoRef}
          src={media.url}
          poster={media.thumbnailUrl ?? undefined}
          className={mediaClass}
          loop
          playsInline
          controlsList="nodownload noremoteplayback"
          // Só o slide visível baixa vídeo — os vizinhos esperam a vez, senão
          // todos bufferizam juntos e o scroll engasga em aparelho modesto.
          preload={active ? 'auto' : 'none'}
          onLoadedMetadata={(event) =>
            applyFit(event.currentTarget.videoWidth / event.currentTarget.videoHeight)
          }
          onTimeUpdate={(event) => {
            const { currentTime, duration } = event.currentTarget;
            setProgress(duration > 0 ? currentTime / duration : 0);
          }}
        />
      ) : (
        <img
          src={media.url}
          alt={alt}
          draggable={false}
          className={mediaClass}
          loading="lazy"
          onLoad={(event) =>
            applyFit(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)
          }
        />
      )}

      {/* Barra fina de progresso, encostada na nav (só no vídeo visível).
          `timeupdate` pulsa ~4x/s; a transição linear preenche os degraus. */}
      {media.kind === 'video' && active && (
        <div className="feed-progress absolute inset-x-0 z-10 h-0.5 bg-white/20" aria-hidden>
          <div
            className="h-full bg-white/80 transition-[width] duration-300 ease-linear motion-reduce:transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

interface PostMediaProps {
  media: FeedMedia[];
  alt: string;
  // O post está na tela? Só o post visível toca — sem isso todos os posts
  // montados no feed tocariam juntos.
  active: boolean;
}

// Camada de fundo do PostCard. Decide sozinho entre mídia única e carrossel:
// media.length > 1 vira um pager horizontal com snap e pontinhos flutuantes.
export function PostMedia({ media, alt, active }: PostMediaProps) {
  const [index, setIndex] = useState(0);
  const muted = useVideoMuted();
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (media.length === 0) {
    return <div className="absolute inset-0 bg-surface-container" />;
  }

  // Botão de som no primeiro slot do cluster de controles do topo (filtro e
  // criar post, do feed, ocupam os slots seguintes). Presente sempre que o
  // post tem vídeo; só o botão recebe clique.
  const soundToggle = media.some((item) => item.kind === 'video') && (
    <button
      type="button"
      onClick={() => setVideoMuted(!muted)}
      aria-label={muted ? 'Ativar som' : 'Desativar som'}
      aria-pressed={!muted}
      className="feed-ctrl-sound absolute right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/25 text-white backdrop-blur-sm transition-transform active:scale-95"
    >
      {muted ? <VolumeX size={20} aria-hidden /> : <Volume2 size={20} aria-hidden />}
    </button>
  );

  if (media.length === 1) {
    return (
      <>
        <MediaSlide media={media[0]} active={active} alt={alt} />
        {soundToggle}
      </>
    );
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
            <MediaSlide
              media={item}
              active={active && i === index}
              alt={`${alt} (${i + 1}/${media.length})`}
            />
          </div>
        ))}
      </div>

      {/* Pontinhos flutuantes sobre a mídia indicando a página do carrossel,
          centralizados na altura do cluster de controles. */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
        style={{ top: 'calc(var(--feed-inset-t) + 22px)' }}
      >
        <div className="flex items-center gap-1.5 rounded-full bg-black/25 px-2 py-1 backdrop-blur-sm">
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

      {soundToggle}
    </>
  );
}
