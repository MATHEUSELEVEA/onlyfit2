import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { clsx } from 'clsx';
import { formatDuration } from '../time';

// Player de nota de voz: play/pause + barra de progresso + tempo, no estilo do
// Instagram. Usa um único <audio> por bolha, controlado por estado.
export function VoiceMessage({
  url,
  durationMs,
  isMe,
}: {
  url: string;
  durationMs?: number;
  isMe: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setProgress(audio.currentTime / audio.duration);
      }
      setElapsedMs(audio.currentTime * 1000);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
      setElapsedMs(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  }

  const track = isMe ? 'bg-on-primary/25' : 'bg-on-surface/15';
  const fill = isMe ? 'bg-on-primary' : 'bg-primary';
  const timeLabel = elapsedMs > 0 ? formatDuration(elapsedMs) : formatDuration(durationMs);

  return (
    <div className="flex w-52 items-center gap-3 px-1 py-1">
      <audio ref={audioRef} src={url} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pausar' : 'Reproduzir'}
        className={clsx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90',
          isMe ? 'bg-on-primary/20 text-on-primary' : 'bg-primary/10 text-primary',
        )}
      >
        {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
      </button>
      <div className="flex-1">
        <div className={clsx('h-1.5 w-full overflow-hidden rounded-full', track)}>
          <div
            className={clsx('h-full rounded-full', fill)}
            style={{ width: `${Math.max(4, progress * 100)}%` }}
          />
        </div>
      </div>
      <span
        className={clsx(
          'shrink-0 font-sans text-eyebrow tabular-nums',
          isMe ? 'text-on-primary/70' : 'text-on-surface-variant',
        )}
      >
        {timeLabel}
      </span>
    </div>
  );
}
