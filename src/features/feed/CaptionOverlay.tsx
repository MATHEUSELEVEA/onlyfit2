import { useEffect, useRef, useState, type RefObject } from 'react';
import { clsx } from 'clsx';
import { captionContainerClass, captionTextClass, findCueIndex, type CaptionTrack } from '@/lib/captions';

// requestVideoFrameCallback dá o tempo EXATO do frame na tela — o clock mais
// preciso para sincronizar overlay com vídeo. Tipado sem `as any`.
interface VideoFrameMetadata {
  mediaTime: number;
}
type FrameCapableVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: VideoFrameMetadata) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Legenda autoral com sincronia de nível de frame — hardened.
 *
 * Regras: (1) clock único = o próprio <video> (mediaTime/currentTime), nunca
 * timer de parede; (2) amostra por FRAME via requestVideoFrameCallback (o
 * mediaTime é o do frame exibido), fallback rAF; (3) busca da fala por cursor
 * (O(1) no avanço normal, binária no pior caso); (4) cobre seek pausado, troca
 * de velocidade e (re)carga via eventos; (5) reseta ao sair de tela (nada de
 * legenda presa no carrossel); (6) rAF não gira à toa com o vídeo pausado;
 * (7) re-renderiza só quando a fala muda.
 */
export function CaptionOverlay({ track, videoRef, active }: { track: CaptionTrack; videoRef: RefObject<HTMLVideoElement | null>; active: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const cursorRef = useRef(0);
  const lastIndexRef = useRef(-1);

  useEffect(() => {
    // Slide fora de tela: não roda loop; a exibição é zerada pelo gate de
    // render abaixo (sem setState síncrono no corpo do efeito).
    if (!active) {
      lastIndexRef.current = -1;
      cursorRef.current = 0;
      return;
    }
    const video = videoRef.current as FrameCapableVideo | null;
    if (!video) return;

    let stopped = false;
    let rafId = 0;
    let vfcId = 0;
    const supportsVfc = typeof video.requestVideoFrameCallback === 'function';

    const apply = (time: number) => {
      const index = findCueIndex(track.cues, time, cursorRef.current);
      if (index !== -1) cursorRef.current = index;
      if (index !== lastIndexRef.current) {
        lastIndexRef.current = index;
        setText(index === -1 ? null : track.cues[index].text);
      }
    };

    const frameLoop = (_now: number, metadata: VideoFrameMetadata) => {
      if (stopped) return;
      apply(metadata.mediaTime);
      vfcId = video.requestVideoFrameCallback!(frameLoop);
    };
    const rafLoop = () => {
      if (stopped) return;
      // Pausado, o frame não muda → não reamostra (o seek/ratechange cobrem).
      if (!video.paused) apply(video.currentTime);
      rafId = requestAnimationFrame(rafLoop);
    };

    // Eventos que mudam o tempo sem novo frame apresentado (seek pausado,
    // velocidade, (re)carga). Estado inicial deferido (fora do corpo do efeito).
    const onSync = () => apply(video.currentTime);
    video.addEventListener('seeked', onSync);
    video.addEventListener('ratechange', onSync);
    video.addEventListener('loadedmetadata', onSync);
    queueMicrotask(() => {
      if (!stopped) apply(video.currentTime);
    });

    if (supportsVfc) vfcId = video.requestVideoFrameCallback!(frameLoop);
    else rafId = requestAnimationFrame(rafLoop);

    return () => {
      stopped = true;
      if (supportsVfc && vfcId) video.cancelVideoFrameCallback?.(vfcId);
      if (rafId) cancelAnimationFrame(rafId);
      video.removeEventListener('seeked', onSync);
      video.removeEventListener('ratechange', onSync);
      video.removeEventListener('loadedmetadata', onSync);
    };
  }, [videoRef, active, track.cues]);

  if (!active || text === null) return null;
  return (
    <div className={clsx('pointer-events-none absolute inset-0 z-[15] flex justify-center px-4', captionContainerClass(track.style))}>
      <span className={clsx('text-center', captionTextClass(track.style))}>{text}</span>
    </div>
  );
}
