import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Check, Loader2, X } from 'lucide-react';
import { uploadAsset } from '@/features/studio/upload';

interface AvatarEditorProps {
  file: File;
  onCancel: () => void;
  onUploaded: (publicUrl: string) => void;
}

const OUTPUT_SIZE = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function cropToBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');

  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar imagem'))),
      'image/jpeg',
      0.9,
    );
  });
}

// Modal de enquadramento do avatar: o usuário arrasta/dá zoom sobre a foto
// escolhida (upload ou câmera) até o recorte quadrado ficar como quer, e só
// então ela é cortada em canvas e enviada ao bucket onlyfit-avatar (R2).
export function AvatarEditor({ file, onCancel, onUploaded }: AvatarEditorProps) {
  const [imageSrc] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels);
  }, []);

  async function handleConfirm() {
    if (!croppedArea || saving) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await cropToBlob(imageSrc, croppedArea);
      const publicUrl = await uploadAsset(blob, `avatar-${Date.now()}.jpg`, 'image/jpeg', 'onlyfit-avatar');
      onUploaded(publicUrl);
    } catch {
      setError('Não foi possível enviar a foto. Tente novamente.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-modal="true">
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="shrink-0 space-y-4 bg-black px-6 pb-safe-bottom pt-4">
        {error && <p className="text-center font-sans text-body-sm text-error">{error}</p>}

        <input
          aria-label="Zoom"
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
        />

        <div className="flex items-center justify-between gap-4 pb-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            aria-label="Cancelar"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-60"
          >
            <X size={22} aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !croppedArea}
            aria-label="Confirmar"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-60"
          >
            {saving ? (
              <Loader2 size={22} className="animate-spin" aria-hidden />
            ) : (
              <Check size={22} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
