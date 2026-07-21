import { useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Play, Plus, X, ZoomIn } from 'lucide-react';
import { clsx } from 'clsx';
import type { DraftMedia } from '../media';

const ASPECT = 9 / 16;

interface FramingStepProps {
  media: DraftMedia[];
  onRemove: (id: string) => void;
  onAddMore: () => void;
  // Devolve as áreas de recorte (croppedAreaPixels) por id de imagem; o
  // StudioPage aplica o recorte e avança.
  onNext: (areasById: Record<string, Area>) => void;
}

// Passo Enquadrar do wizard: fotos são recortadas no 9:16 do feed com pan/zoom
// (WYSIWYG). Vídeos já preenchem a tela (object-cover) e não são recortados no
// cliente — aparecem só para conferência. A tira gerencia o carrossel.
export function FramingStep({ media, onRemove, onAddMore, onNext }: FramingStepProps) {
  const [selected, setSelected] = useState(0);
  const [crops, setCrops] = useState<Record<string, { x: number; y: number }>>({});
  const [zooms, setZooms] = useState<Record<string, number>>({});
  const [areas, setAreas] = useState<Record<string, Area>>({});

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

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {current.kind === 'image' ? (
          <Cropper
            image={current.previewUrl}
            crop={crops[id] ?? { x: 0, y: 0 }}
            zoom={zooms[id] ?? 1}
            minZoom={1}
            maxZoom={4}
            aspect={ASPECT}
            objectFit="cover"
            showGrid={false}
            onCropChange={(next) => setCrops((prev) => ({ ...prev, [id]: next }))}
            onZoomChange={(next) => setZooms((prev) => ({ ...prev, [id]: next }))}
            onCropComplete={(_area, areaPixels) => setAreas((prev) => ({ ...prev, [id]: areaPixels }))}
          />
        ) : (
          <>
            <video key={id} src={current.previewUrl} className="h-full w-full object-cover" muted loop playsInline autoPlay preload="metadata" />
            <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/50 px-3 py-1 font-sans text-counter text-white backdrop-blur-sm">
              O vídeo já preenche a tela
            </span>
          </>
        )}

        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-3">
          <span className="rounded-full bg-black/40 px-2.5 py-1 font-sans text-counter text-white backdrop-blur-sm">
            {index === 0 ? 'Capa' : `${index + 1}/${media.length}`}
          </span>
          <button
            type="button"
            onClick={() => onRemove(id)}
            aria-label="Remover mídia"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-transform active:scale-90"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      </div>

      {current.kind === 'image' && (
        <div className="flex items-center gap-3 px-5 pt-4">
          <ZoomIn size={16} className="shrink-0 text-on-surface-variant" aria-hidden />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zooms[id] ?? 1}
            onChange={(e) => setZooms((prev) => ({ ...prev, [id]: Number(e.target.value) }))}
            aria-label="Aproximar"
            className="h-8 w-full cursor-pointer accent-primary"
          />
        </div>
      )}

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
          className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-outline-variant/60 bg-surface-container-low text-on-surface-variant transition-colors active:bg-surface-container"
        >
          <Plus size={20} aria-hidden />
        </button>
      </div>

      <div className="border-t border-outline-variant/40 p-4">
        <button
          type="button"
          onClick={() => onNext(areas)}
          className="min-h-[52px] w-full rounded-full bg-primary font-sans text-label text-on-primary transition-opacity active:opacity-90"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
