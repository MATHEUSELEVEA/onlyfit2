import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RotateCw, Volume2, VolumeX } from 'lucide-react';
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

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

// Uma página de mídia (vídeo ou imagem) preenchendo o card em tela cheia.
// Vídeo só toca quando é a página ativa do carrossel — imagens são estáticas.
function MediaSlide({ media, active, alt }: { media: FeedMedia; active: boolean; alt: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const aspectRef = useRef(0);
  const [fit, setFit] = useState<MediaFit>('cover');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const muted = useVideoMuted();
  const activeRef = useRef(active);
  const mutedRef = useRef(muted);
  useEffect(() => {
    activeRef.current = active;
    mutedRef.current = muted;
  });

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

  // Fonte do vídeo: prefere o HLS normalizado do Cloudflare Stream (orientação
  // já em pé). iOS/Safari tocam HLS nativo (src direto); demais navegadores
  // carregam hls.js sob demanda. Sem HLS pronto, cai no arquivo cru do R2.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || media.kind !== 'video') return;
    const raw = media.url;
    const hlsUrl = media.hlsUrl ?? null;
    const play = () => {
      if (!activeRef.current) return;
      video.muted = mutedRef.current;
      void video.play().catch(() => {
        video.muted = true;
        muteAfterAutoplayBlock();
        void video.play().catch(() => {});
      });
    };
    if (!hlsUrl || video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl ?? raw;
      return;
    }
    let destroyed = false;
    let hls: import('hls.js').default | null = null;
    void import('hls.js')
      .then(({ default: Hls }) => {
        if (destroyed) return;
        if (Hls.isSupported()) {
          hls = new Hls({ enableWorker: true });
          hls.on(Hls.Events.MANIFEST_PARSED, play);
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);
        } else {
          video.src = raw;
        }
      })
      .catch(() => {
        if (!destroyed) video.src = raw;
      });
    return () => {
      destroyed = true;
      if (hls) hls.destroy();
    };
  }, [media.kind, media.url, media.hlsUrl]);

  const seek = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(seconds)) return;
    video.currentTime = seconds;
    setCurrentTime(seconds);
  };

  const retryVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    setVideoError(false);
    setBuffering(true);
    video.load();
    if (!active) return;
    video.muted = muted;
    void video.play().catch(() => {
      video.muted = true;
      muteAfterAutoplayBlock();
      void video.play().catch(() => setVideoError(true));
    });
  };

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
          poster={media.thumbnailUrl ?? undefined}
          className={mediaClass}
          loop
          playsInline
          controlsList="nodownload noremoteplayback"
          // Só o slide visível baixa vídeo — os vizinhos esperam a vez, senão
          // todos bufferizam juntos e o scroll engasga em aparelho modesto.
          preload={active ? 'auto' : 'none'}
          onLoadStart={() => setBuffering(true)}
          onLoadedMetadata={(event) => {
            applyFit(event.currentTarget.videoWidth / event.currentTarget.videoHeight);
            setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
          }}
          onCanPlay={() => {
            setBuffering(false);
            setVideoError(false);
          }}
          onPlaying={() => setBuffering(false)}
          onWaiting={() => setBuffering(true)}
          onError={() => {
            setBuffering(false);
            setVideoError(true);
          }}
          onTimeUpdate={(event) => {
            setCurrentTime(event.currentTarget.currentTime);
            if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
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

      {media.kind === 'video' && active && buffering && !videoError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" role="status">
          <Loader2 size={28} className="animate-spin text-white drop-shadow" aria-label="Carregando vídeo" />
        </div>
      )}

      {media.kind === 'video' && active && videoError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-8 text-center">
          <button
            type="button"
            onClick={retryVideo}
            className="flex min-h-12 items-center gap-2 rounded-full bg-black/60 px-5 font-sans text-label text-white backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <RotateCw size={18} aria-hidden />
            Tentar carregar o vídeo novamente
          </button>
        </div>
      )}

      {/* Scrubber real: permite voltar ao início ou a qualquer ponto sem
          esperar o loop. A área de toque fica totalmente acima da BottomNav. */}
      {media.kind === 'video' && active && duration > 0 && (
        <label
          className="feed-progress-control absolute inset-x-0 z-20 flex h-11 items-center px-3"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="sr-only">Progresso do vídeo</span>
          <span className="pointer-events-none absolute inset-x-3 h-1 overflow-hidden rounded-full bg-white/25" aria-hidden>
            <span
              className="block h-full rounded-full bg-white/90 transition-[width] duration-200 ease-linear motion-reduce:transition-none"
              style={{ width: `${Math.min(100, currentTime / duration * 100)}%` }}
            />
          </span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={Math.min(currentTime, duration)}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Progresso do vídeo"
            aria-valuetext={`${formatVideoTime(currentTime)} de ${formatVideoTime(duration)}`}
            className="feed-progress-input relative h-11 w-full cursor-pointer appearance-none bg-transparent text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          />
        </label>
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
