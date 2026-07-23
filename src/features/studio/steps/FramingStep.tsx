import { useRef, useState, type PointerEvent } from 'react';
import { Minus, Play, Plus, RefreshCcw, X } from 'lucide-react';
import { clsx } from 'clsx';
import { DEFAULT_MEDIA_FRAMING, mediaFramingStyle, updateMediaFraming } from '@/features/mediaFraming';
import type { DraftMedia, MediaFraming } from '../media';

interface FramingStepProps {
  media: DraftMedia[];
  onRemove: (id: string) => void;
  onAddMore: () => void;
  onFramingChange: (id: string, framing: MediaFraming) => void;
  onNext: () => void;
}

// Passo de revisão do wizard. A moldura é 9:16 (o formato único do feed): a foto
// aparece já enquadrada nesse aspecto, preenchendo. O usuário só reposiciona/dá
// zoom dentro da moldura; no upload a imagem é assada nesse 9:16
// (bakeImageDraftToFeed), então o que se vê aqui é o que sai no feed.
export function FramingStep({ media, onRemove, onAddMore, onFramingChange, onNext }: FramingStepProps) {
  const [selected, setSelected] = useState(0);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    ids: [number, number];
    startDistance: number;
    startCenterX: number;
    startCenterY: number;
    startZoom: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  if (media.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <button
          type="button"
          onClick={onAddMore}
          className="flex min-h-[16rem] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/60 bg-surface-container-low text-on-surface-variant transition-colors active:bg-surface-container"
        >
          <Plus size={40} strokeWidth={1.5} aria-hidden />
          <span className="font-sans text-title text-on-surface">Adicionar mídia</span>
        </button>
      </div>
    );
  }

  const index = Math.min(selected, media.length - 1);
  const current = media[index];
  const id = current.id;
  // Imagem preenche a moldura 9:16 por padrão (o feed é sempre preenchido).
  const framing = current.framing ?? (current.kind === 'image' ? { ...DEFAULT_MEDIA_FRAMING, fit: 'cover' as const } : DEFAULT_MEDIA_FRAMING);
  const canTune = current.kind === 'image';

  const setCurrentFraming = (patch: Partial<MediaFraming>) => {
    onFramingChange(id, updateMediaFraming(framing, patch));
  };

  const pointerDistance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const startPinch = () => {
    const entries = Array.from(pointersRef.current.entries());
    if (entries.length < 2) return;
    const [first, second] = entries;
    const distance = pointerDistance(first[1], second[1]);
    pinchRef.current = {
      ids: [first[0], second[0]],
      startDistance: Math.max(distance, 1),
      startCenterX: (first[1].x + second[1].x) / 2,
      startCenterY: (first[1].y + second[1].y) / 2,
      startZoom: framing.zoom,
      startOffsetX: framing.offsetX,
      startOffsetY: framing.offsetY,
    };
    dragRef.current = null;
  };

  const startGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (!canTune) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      startPinch();
      return;
    }
    if (!pinchRef.current) {
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: framing.offsetX,
        startOffsetY: framing.offsetY,
      };
    }
  };

  const moveGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = pinchRef.current;
    if (pinch) {
      const first = pointersRef.current.get(pinch.ids[0]);
      const second = pointersRef.current.get(pinch.ids[1]);
      if (!first || !second) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      const centerDeltaX = ((centerX - pinch.startCenterX) / Math.max(rect.width, 1)) * 100;
      const centerDeltaY = ((centerY - pinch.startCenterY) / Math.max(rect.height, 1)) * 100;
      const nextZoom = pinch.startZoom * (pointerDistance(first, second) / pinch.startDistance);
      onFramingChange(id, updateMediaFraming(framing, {
        zoom: nextZoom,
        offsetX: pinch.startOffsetX + centerDeltaX,
        offsetY: pinch.startOffsetY + centerDeltaY,
      }));
      return;
    }

    const activeDrag = dragRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = ((event.clientX - activeDrag.startX) / Math.max(rect.width, 1)) * 100;
    const deltaY = ((event.clientY - activeDrag.startY) / Math.max(rect.height, 1)) * 100;
    onFramingChange(id, updateMediaFraming(framing, {
      offsetX: activeDrag.startOffsetX + deltaX,
      offsetY: activeDrag.startOffsetY + deltaY,
    }));
  };

  const endGesture = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pinchRef.current?.ids.includes(event.pointerId)) pinchRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        <div
          className={clsx('relative aspect-[9/16] max-h-full w-full overflow-hidden bg-surface-container-lowest touch-none', canTune && 'cursor-grab active:cursor-grabbing')}
          onPointerDown={startGesture}
          onPointerMove={moveGesture}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
        >
        {current.kind === 'image' ? (
          <>
            <img src={current.previewUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" aria-hidden />
            <img
              src={current.previewUrl}
              alt=""
              draggable={false}
              className="relative z-10 h-full w-full select-none transition-transform duration-150 ease-out will-change-transform"
              style={mediaFramingStyle(framing)}
            />
          </>
        ) : (
          <>
            <video key={id} src={current.previewUrl} className="h-full w-full object-contain" muted loop playsInline autoPlay preload="metadata" />
            <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-surface/75 px-3 py-1 font-sans text-counter text-on-surface shadow-elevation-1 backdrop-blur-sm">
              Vídeo preservado
            </span>
          </>
        )}

        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-3">
          <span className="rounded-full bg-surface/75 px-2.5 py-1 font-sans text-counter text-on-surface shadow-elevation-1 backdrop-blur-sm">
            {index === 0 ? 'Capa' : `${index + 1}/${media.length}`}
          </span>
          <button
            type="button"
            onClick={() => onRemove(id)}
            aria-label="Remover mídia"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/75 text-on-surface shadow-elevation-1 backdrop-blur-sm transition-transform active:scale-90"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {canTune && (
          <div
            className="absolute inset-x-0 bottom-3 z-20 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-full border border-outline-variant/50 bg-surface/80 p-1 text-on-surface shadow-elevation-2 backdrop-blur-md"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setCurrentFraming({ zoom: framing.zoom - 0.15 })}
              aria-label="Diminuir zoom"
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-surface-container-high"
            >
              <Minus size={18} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setCurrentFraming({ zoom: framing.zoom + 0.15 })}
              aria-label="Aumentar zoom"
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-surface-container-high"
            >
              <Plus size={18} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onFramingChange(id, { ...DEFAULT_MEDIA_FRAMING, fit: 'cover' })}
              aria-label="Redefinir enquadramento"
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-surface-container-high"
            >
              <RefreshCcw size={17} aria-hidden />
            </button>
          </div>
        )}
        </div>
      </div>

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
                <video src={item.previewUrl} className="h-full w-full object-contain" muted preload="metadata" />
                <span className="absolute bottom-1 right-1 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"><Play size={10} fill="currentColor" aria-hidden /></span>
              </>
            ) : (
              <img src={item.previewUrl} alt="" className="h-full w-full object-contain" />
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={onAddMore}
          aria-label="Adicionar mídia"
          className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-outline-variant/60 bg-surface-container-low text-on-surface-variant transition-colors active:bg-surface-container"
        >
          <Plus size={20} aria-hidden />
        </button>
      </div>

      <div className="border-t border-outline-variant/40 p-4">
        <button
          type="button"
          onClick={onNext}
          className="min-h-[52px] w-full rounded-full bg-primary font-sans text-label text-on-primary transition-opacity active:opacity-90"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
