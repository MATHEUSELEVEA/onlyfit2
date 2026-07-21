import { useEffect, useRef, useState, type RefObject } from 'react';
import { clsx } from 'clsx';
import { activeCue, captionContainerClass, captionTextClass, type CaptionCue, type CaptionTrack } from '@/lib/captions';

// requestVideoFrameCallback dá o tempo EXATO do frame que está na tela — a
// forma mais precisa de sincronizar overlay com vídeo. Tipado sem `as any`.
interface VideoFrameMetadata {
  mediaTime: number;
}
type FrameCapableVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: VideoFrameMetadata) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Legenda autoral sincronizada com sincronia de nível de frame.
 *
 * Regras de ouro (padrão dos melhores players): (1) relógio único = o próprio
 * <video> (video.currentTime / mediaTime), nunca timer de parede; (2) amostra
 * por FRAME via requestVideoFrameCallback (fallback rAF), que entrega o tempo
 * do frame exibido; (3) cobre seek com vídeo pausado via evento `seeked`;
 * (4) só re-renderiza quando a fala muda. Zero drift, zero atraso perceptível.
 */
export function CaptionOverlay({ track, videoRef, active }: { track: CaptionTrack; videoRef: RefObject<HTMLVideoElement | null>; active: boolean }) {
  const [cue, setCue] = useState<CaptionCue | null>(null);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const video = videoRef.current as FrameCapableVideo | null;
    if (!video) return;
    let stopped = false;
    let rafId = 0;
    let vfcId = 0;
    const supportsVfc = typeof video.requestVideoFrameCallback === 'function';

    // Aplica a cue correta para um instante do relógio do vídeo; troca o
    // estado só quando a fala muda (evita re-render por frame).
    const apply = (time: number) => {
      const next = activeCue(track.cues, time);
      const key = next ? `${next.start}|${next.text}` : null;
      if (key !== lastKeyRef.current) {
        lastKeyRef.current = key;
        setCue(next);
      }
    };

    const frameLoop = (_now: number, metadata: VideoFrameMetadata) => {
      if (stopped) return;
      apply(metadata.mediaTime);
      vfcId = video.requestVideoFrameCallback!(frameLoop);
    };
    const rafLoop = () => {
      if (stopped) return;
      apply(video.currentTime);
      rafId = requestAnimationFrame(rafLoop);
    };

    // Estado inicial imediato + cobre seek/mudança com o vídeo pausado.
    apply(video.currentTime);
    const onSeek = () => apply(video.currentTime);
    video.addEventListener('seeked', onSeek);

    // Só roda o loop por frame quando o slide está ativo (o vídeo só toca aí).
    if (active) {
      if (supportsVfc) vfcId = video.requestVideoFrameCallback!(frameLoop);
      else rafId = requestAnimationFrame(rafLoop);
    }

    return () => {
      stopped = true;
      if (supportsVfc && vfcId) video.cancelVideoFrameCallback?.(vfcId);
      if (rafId) cancelAnimationFrame(rafId);
      video.removeEventListener('seeked', onSeek);
    };
  }, [videoRef, active, track.cues]);

  if (!cue) return null;
  return (
    <div className={clsx('pointer-events-none absolute inset-0 z-[15] flex justify-center px-4', captionContainerClass(track.style))}>
      <span className={clsx('text-center', captionTextClass(track.style))}>{cue.text}</span>
    </div>
  );
}
