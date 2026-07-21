import { clsx } from 'clsx';
import type { CaptureMode } from '../media';

interface CameraModeSwitcherProps {
  mode: CaptureMode;
  onChange: (mode: CaptureMode) => void;
}

const MODES: { value: CaptureMode; label: string }[] = [
  { value: 'photo', label: 'Foto' },
  { value: 'video', label: 'Vídeo' },
  { value: 'stories', label: 'Stories' },
];

// Seletor de modo estilo Instagram (POST/STORY na referência). Cada modo muda
// o destino da captura no StudioPage: Foto/Vídeo entram no fluxo de post
// (revisão → detalhes → publicar); Stories publica direto como conteúdo de 24h.
export function CameraModeSwitcher({ mode, onChange }: CameraModeSwitcherProps) {
  return (
    <div role="tablist" aria-label="Modo de captura" className="flex items-center justify-center gap-6">
      {MODES.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={mode === item.value}
          onClick={() => onChange(item.value)}
          className={clsx(
            'relative px-1 font-sans text-label drop-shadow-lg transition-colors',
            mode === item.value ? 'text-white' : 'text-white/55',
          )}
        >
          {item.label}
          {mode === item.value && (
            <span className="absolute -bottom-2 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white" aria-hidden />
          )}
        </button>
      ))}
    </div>
  );
}
