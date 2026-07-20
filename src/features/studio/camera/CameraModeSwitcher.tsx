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

// Seletor de modo estilo Instagram. A pill "Stories" já fica selecionável
// neste PR (entrega a UI completa do pedido), mas o efeito de capturar nesse
// modo ainda é só um aviso — CameraStep.onStoriesCaptureAttempt — até a
// publicação real de Stories entrar num PR seguinte.
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
            'font-sans text-label drop-shadow-lg transition-colors',
            mode === item.value ? 'text-white' : 'text-white/55',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
