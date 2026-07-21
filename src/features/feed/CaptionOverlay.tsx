import { clsx } from 'clsx';
import { activeCue, captionContainerClass, captionTextClass, type CaptionTrack } from '@/lib/captions';

// Overlay de legenda autoral sincronizado com o tempo do vídeo. Desenha a fala
// ativa com o estilo escolhido pelo criador. Sem interação (pointer-events-none).
export function CaptionOverlay({ track, currentTime }: { track: CaptionTrack; currentTime: number }) {
  const cue = activeCue(track.cues, currentTime);
  if (!cue) return null;
  return (
    <div className={clsx('pointer-events-none absolute inset-0 z-[15] flex justify-center px-4', captionContainerClass(track.style))}>
      <span className={clsx('text-center', captionTextClass(track.style))}>{cue.text}</span>
    </div>
  );
}
