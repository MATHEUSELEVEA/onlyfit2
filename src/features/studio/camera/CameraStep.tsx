import { useEffect, useRef, useState } from 'react';
import { Images, Loader2, SwitchCamera, X, Zap, ZapOff } from 'lucide-react';
import { clsx } from 'clsx';
import { CameraModeSwitcher } from './CameraModeSwitcher';
import { useCameraStream, type CameraFacing } from './useCameraStream';
import { useVideoCapture } from './useVideoCapture';
import { createDraftMediaFromCapture, type CaptureMode, type DraftMedia } from '../media';

interface CameraStepProps {
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  onCapturedPhoto: (draft: DraftMedia) => void;
  onCapturedVideo: (draft: DraftMedia) => void;
  onGalleryFiles: (files: FileList) => void;
  onClose: () => void;
  // Estado da publicação de story (modo Stories publica direto, sem passar
  // pela tela de detalhes — ver StudioPage). Enquanto sobe, a tela fica
  // bloqueada; se falha, mostra a opção de tentar de novo/descartar.
  storyPublishing?: boolean;
  storyError?: string | null;
  onRetryStory?: () => void;
  onDismissStoryError?: () => void;
}

// Duração do "flash de tela" (foto): a tela fica branca por um instante para
// iluminar o rosto na câmera frontal antes de capturar o quadro.
const SCREEN_FLASH_MS = 160;

function capturePhotoBlob(video: HTMLVideoElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (video.videoWidth === 0 || video.videoHeight === 0) {
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
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
  });
}

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Tela de câmera full-screen: primeiro passo do Studio (substitui a entrada
// direta no picker de galeria). Preview em tempo real via getUserMedia,
// captura de foto/vídeo local, com a galeria disponível como opção secundária
// — igual ao Instagram, câmera é o padrão, mas nunca a única saída.
export function CameraStep({
  mode,
  onModeChange,
  onCapturedPhoto,
  onCapturedVideo,
  onGalleryFiles,
  onClose,
  storyPublishing = false,
  storyError = null,
  onRetryStory,
  onDismissStoryError,
}: CameraStepProps) {
  const [facing, setFacing] = useState<CameraFacing>('environment');
  const { stream, error, retry } = useCameraStream(facing);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [screenFlash, setScreenFlash] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) video.play().catch(() => {});
  }, [stream]);

  // Lanterna (torch): tentativa best-effort. O WebView do iOS quase nunca
  // expõe a constraint `torch`, então isto costuma ser um no-op silencioso —
  // por isso a foto também conta com o flash de tela (screenFlash).
  const applyTorch = async (on: boolean) => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] } as unknown as MediaTrackConstraints);
    } catch {
      // torch não suportado neste aparelho/WebView — ignora.
    }
  };

  const { isRecording, elapsedMs, start: startRecording, stop: stopRecording } = useVideoCapture({
    stream,
    previewVideoRef: videoRef,
    onCaptured: (result) => {
      if (!result) return;
      onCapturedVideo(createDraftMediaFromCapture(result.file, 'video', result.posterBlob));
    },
  });

  const handleShutterTap = async () => {
    if (storyPublishing) return;

    if (mode === 'photo') {
      if (!videoRef.current || capturingPhoto) return;
      setCapturingPhoto(true);
      if (flashOn) {
        setScreenFlash(true);
        await new Promise((resolve) => setTimeout(resolve, SCREEN_FLASH_MS));
        void applyTorch(true);
      }
      const blob = await capturePhotoBlob(videoRef.current);
      if (flashOn) {
        void applyTorch(false);
        setScreenFlash(false);
      }
      setCapturingPhoto(false);
      if (!blob) return;
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapturedPhoto(createDraftMediaFromCapture(file, 'image'));
      return;
    }

    // Vídeo e Stories gravam do mesmo jeito (Stories é vídeo com validade de
    // 24h); o que muda é o destino da mídia, decidido no StudioPage pelo modo.
    if (isRecording) {
      void applyTorch(false);
      stopRecording();
      return;
    }
    if (flashOn) void applyTorch(true);
    void startRecording();
  };

  return (
    <div className="relative flex h-full flex-col bg-black">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onGalleryFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Flash de tela: clarão branco por um instante para iluminar a selfie. */}
      {screenFlash && <div className="pointer-events-none absolute inset-0 z-40 bg-white" aria-hidden />}

      {/* Modo Stories publica direto (sem tela de detalhes): enquanto sobe, a
          tela toda fica bloqueada; um erro deixa tentar de novo ou descartar. */}
      {storyPublishing && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/75">
          <Loader2 size={32} className="animate-spin text-white" aria-hidden />
          <span className="font-sans text-label text-white">Publicando story…</span>
        </div>
      )}

      {storyError && !storyPublishing && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/80 px-8 text-center">
          <p className="font-sans text-title text-white">Não foi possível publicar o story</p>
          <p className="text-body-sm text-white/70">{storyError}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onDismissStoryError}
              className="min-h-[44px] rounded-full bg-white/15 px-6 font-sans text-label text-white"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={onRetryStory}
              className="min-h-[44px] rounded-full bg-white px-6 font-sans text-label text-black"
            >
              Tentar de novo
            </button>
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {stream && (
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className={clsx('h-full w-full object-cover', facing === 'user' && '-scale-x-100')}
          />
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="font-sans text-title text-white">
              {error === 'denied' ? 'Câmera sem permissão' : 'Câmera indisponível'}
            </p>
            <p className="text-body-sm text-white/70">
              {error === 'denied'
                ? 'Ative o acesso à câmera nas Configurações do iOS para gravar por aqui.'
                : 'Não foi possível abrir a câmera neste aparelho. Você ainda pode escolher da galeria.'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={retry}
                className="min-h-[44px] rounded-full bg-white/15 px-6 font-sans text-label text-white"
              >
                Tentar de novo
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] rounded-full bg-white px-6 font-sans text-label text-black"
              >
                Escolher da galeria
              </button>
            </div>
          </div>
        )}

        {/* Barra superior: fechar (esq.) · flash ou tempo de gravação (centro) */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pb-3 pt-safe-top">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar câmera"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white"
          >
            <X size={20} aria-hidden />
          </button>

          {isRecording ? (
            <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-error" aria-hidden />
              <span className="font-sans text-counter text-white">{formatElapsed(elapsedMs)}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFlashOn((prev) => !prev)}
              aria-label={flashOn ? 'Desligar flash' : 'Ligar flash'}
              aria-pressed={flashOn}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white"
            >
              {flashOn ? <Zap size={20} aria-hidden /> : <ZapOff size={20} aria-hidden />}
            </button>
          )}

          <div className="h-10 w-10" aria-hidden />
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 bg-black pb-safe-bottom pt-4">
        <CameraModeSwitcher mode={mode} onChange={onModeChange} />

        {/* Galeria (esq.) · obturador (centro) · virar câmera (dir.) */}
        <div className="grid w-full grid-cols-3 items-center px-8 pb-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Escolher da galeria"
            className="flex h-12 w-12 items-center justify-center justify-self-start overflow-hidden rounded-xl border-2 border-white/70 bg-white/5 text-white"
          >
            <Images size={22} aria-hidden />
          </button>

          <button
            type="button"
            onClick={handleShutterTap}
            aria-label={mode === 'photo' ? 'Capturar foto' : isRecording ? 'Parar gravação' : 'Iniciar gravação'}
            className="flex h-[72px] w-[72px] items-center justify-center justify-self-center rounded-full border-4 border-white bg-white/10 transition-transform active:scale-95"
          >
            <span
              className={clsx(
                'transition-all',
                isRecording && 'h-6 w-6 rounded-md bg-error',
                !isRecording && mode === 'photo' && 'h-14 w-14 rounded-full bg-white',
                !isRecording && mode !== 'photo' && 'h-14 w-14 rounded-full bg-error',
              )}
              aria-hidden
            />
          </button>

          <button
            type="button"
            onClick={() => setFacing((prev) => (prev === 'user' ? 'environment' : 'user'))}
            aria-label="Virar câmera"
            disabled={isRecording}
            className="flex h-12 w-12 items-center justify-center justify-self-end rounded-full bg-white/15 text-white disabled:opacity-40"
          >
            <SwitchCamera size={22} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
