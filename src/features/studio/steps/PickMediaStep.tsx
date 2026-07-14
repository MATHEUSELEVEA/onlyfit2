import { useRef } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Play, Plus, X } from 'lucide-react';
import type { DraftMedia } from '../media';

interface MediaThumbProps {
  media: DraftMedia;
  index: number;
  total: number;
  onRemove: () => void;
  onMove: (to: number) => void;
}

function MediaThumb({ media, index, total, onRemove, onMove }: MediaThumbProps) {
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-surface-container">
      {media.kind === 'video' ? (
        <>
          <video src={media.previewUrl} className="h-full w-full object-cover" muted preload="metadata" />
          <span className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            <Play size={12} fill="currentColor" aria-hidden />
          </span>
        </>
      ) : (
        <img src={media.previewUrl} alt="" className="h-full w-full object-cover" />
      )}

      {index === 0 && (
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-primary px-2 py-0.5 font-sans text-counter text-on-primary">
          Capa
        </span>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remover mídia"
        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <X size={16} aria-hidden />
      </button>

      {/* Reordenar páginas do carrossel */}
      <div className="absolute bottom-1.5 right-1.5 flex gap-1">
        {index > 0 && (
          <button
            type="button"
            onClick={() => onMove(index - 1)}
            aria-label="Mover para a esquerda"
            className="flex h-7 w-7 items-center justify-center text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <ArrowLeft size={14} aria-hidden />
          </button>
        )}
        {index < total - 1 && (
          <button
            type="button"
            onClick={() => onMove(index + 1)}
            aria-label="Mover para a direita"
            className="flex h-7 w-7 items-center justify-center text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <ArrowRight size={14} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

interface PickMediaStepProps {
  media: DraftMedia[];
  onAdd: (files: FileList) => void;
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onNext: () => void;
}

export function PickMediaStep({ media, onAdd, onRemove, onMove, onNext }: PickMediaStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="flex h-full flex-col">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAdd(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {media.length === 0 ? (
          <button
            type="button"
            onClick={openPicker}
            className="flex h-full min-h-[16rem] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/60 bg-surface-container-low text-on-surface-variant transition-colors active:bg-surface-container"
          >
            <ImagePlus size={40} strokeWidth={1.5} aria-hidden />
            <span className="font-sans text-title text-on-surface">Toque para escolher</span>
            <span className="max-w-[15rem] text-center text-body-sm">
              Imagem única, vídeo ou várias mídias para montar um carrossel.
            </span>
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {media.map((item, index) => (
              <MediaThumb
                key={item.id}
                media={item}
                index={index}
                total={media.length}
                onRemove={() => onRemove(item.id)}
                onMove={(to) => onMove(index, to)}
              />
            ))}
            <button
              type="button"
              onClick={openPicker}
              aria-label="Adicionar mídia"
              className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-low text-on-surface-variant active:bg-surface-container"
            >
              <Plus size={24} aria-hidden />
              <span className="font-sans text-counter">Adicionar</span>
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-outline-variant/40 p-4">
        <button
          type="button"
          onClick={onNext}
          disabled={media.length === 0}
          className="min-h-[48px] w-full rounded-xl bg-primary font-sans text-label text-on-primary transition-opacity active:opacity-90 disabled:opacity-40"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
