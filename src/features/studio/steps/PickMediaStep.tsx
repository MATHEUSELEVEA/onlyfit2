import { useState } from 'react';
import { ArrowLeft, ArrowRight, Play, Plus, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { DraftMedia } from '../media';

interface PickMediaStepProps {
  media: DraftMedia[];
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
  /** Reabre a câmera (CameraStep) — é lá que também vive o acesso à galeria. */
  onAddMore: () => void;
  onNext: () => void;
}

// Revisão WYSIWYG: o item selecionado aparece no MESMO formato do feed (9:16
// full-bleed), não em miniatura quadrada — o que você enquadra é o que publica.
// A tira embaixo gerencia o carrossel (selecionar, reordenar, remover, +).
export function PickMediaStep({ media, onRemove, onMove, onAddMore, onNext }: PickMediaStepProps) {
  const [selected, setSelected] = useState(0);

  if (media.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 p-4">
          <button
            type="button"
            onClick={onAddMore}
            className="flex h-full min-h-[16rem] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/60 bg-surface-container-low text-on-surface-variant transition-colors active:bg-surface-container"
          >
            <Plus size={40} strokeWidth={1.5} aria-hidden />
            <span className="font-sans text-title text-on-surface">Adicionar mídia</span>
          </button>
        </div>
      </div>
    );
  }

  const index = Math.min(selected, media.length - 1);
  const current = media[index];

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Preview no formato do feed (9:16, object-cover) — WYSIWYG. */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {current.kind === 'video' ? (
          <video key={current.id} src={current.previewUrl} className="h-full w-full object-cover" muted loop playsInline autoPlay preload="metadata" />
        ) : (
          <img src={current.previewUrl} alt="" className="h-full w-full object-cover" />
        )}

        {/* Scrim + ações do item atual, flutuando sobre a mídia. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-3">
          <span className="rounded-full bg-black/40 px-2.5 py-1 font-sans text-counter text-white backdrop-blur-sm">
            {index === 0 ? 'Capa' : `${index + 1}/${media.length}`}
          </span>
          <button
            type="button"
            onClick={() => onRemove(current.id)}
            aria-label="Remover mídia"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-transform active:scale-90"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* Reordenar o item atual no carrossel. */}
        {media.length > 1 && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 pb-3">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => { onMove(index, index - 1); setSelected(index - 1); }}
              aria-label="Mover para trás"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-transform active:scale-90 disabled:opacity-30"
            >
              <ArrowLeft size={16} aria-hidden />
            </button>
            <button
              type="button"
              disabled={index === media.length - 1}
              onClick={() => { onMove(index, index + 1); setSelected(index + 1); }}
              aria-label="Mover para frente"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-transform active:scale-90 disabled:opacity-30"
            >
              <ArrowRight size={16} aria-hidden />
            </button>
          </div>
        )}
      </div>

      {/* Tira de miniaturas: selecionar página + adicionar. */}
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 py-3">
        {media.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelected(i)}
            aria-label={`Selecionar mídia ${i + 1}`}
            aria-current={i === index}
            className={clsx(
              'relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-container transition-all',
              i === index ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'opacity-70',
            )}
          >
            {item.kind === 'video' ? (
              <>
                <video src={item.previewUrl} className="h-full w-full object-cover" muted preload="metadata" />
                <span className="absolute bottom-1 right-1 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"><Play size={10} fill="currentColor" aria-hidden /></span>
              </>
            ) : (
              <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={onAddMore}
          aria-label="Adicionar mídia"
          className="flex h-16 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-outline-variant/60 bg-surface-container-low text-on-surface-variant transition-colors active:bg-surface-container"
        >
          <Plus size={20} aria-hidden />
        </button>
      </div>

      <div className="border-t border-outline-variant/40 p-4">
        <button
          type="button"
          onClick={onNext}
          className="min-h-[48px] w-full rounded-full bg-primary font-sans text-label text-on-primary transition-opacity active:opacity-90"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
