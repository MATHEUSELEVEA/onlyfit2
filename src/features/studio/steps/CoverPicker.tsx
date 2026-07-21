import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type { DraftMedia } from '../media';

function frameToBlob(video: HTMLVideoElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!video.videoWidth || !video.videoHeight) {
      resolve(null);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(null);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
  });
}

// Escolher o frame de capa de um vídeo (não é edição do vídeo): scrubber + o
// frame atual vira o poster/thumbnail do post. Full-screen no formato do feed.
export function CoverPicker({ media, onPick, onClose }: { media: DraftMedia; onPick: (blob: Blob) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.pause();
  }, []);

  const seek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    setTime(seconds);
  };

  const use = async () => {
    const video = videoRef.current;
    if (!video || saving) return;
    setSaving(true);
    const blob = await frameToBlob(video);
    setSaving(false);
    if (blob) onPick(blob);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-2 py-2 pt-safe-top">
        <button type="button" onClick={onClose} aria-label="Cancelar" className="flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform active:scale-95">
          <X size={22} aria-hidden />
        </button>
        <span className="font-sans text-title text-white">Escolher capa</span>
        <button type="button" onClick={use} disabled={saving} aria-label="Usar como capa" className="flex h-11 w-11 items-center justify-center rounded-full text-primary transition-transform active:scale-95 disabled:opacity-50">
          {saving ? <Loader2 size={22} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Check size={24} aria-hidden />}
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          src={media.previewUrl}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
          onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        />
      </div>

      <div className="px-5 pb-safe-bottom pt-4">
        <p className="mb-2 text-center font-sans text-body-sm text-white/70">Arraste para escolher o frame</p>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Posição do frame de capa"
          className="h-11 w-full cursor-pointer accent-primary"
        />
        <button
          type="button"
          onClick={use}
          disabled={saving}
          className="mt-2 mb-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary font-sans text-label text-on-primary transition-opacity enabled:active:opacity-90 disabled:opacity-60"
        >
          {saving ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Check size={18} aria-hidden />}
          Usar como capa
        </button>
      </div>
    </div>
  );
}
