import { useEffect, useRef, useState } from 'react';
import { Images, RotateCcw, X } from 'lucide-react';
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
}

const STORIES_NOTICE_MS = 2200;

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
}: CameraStepProps) {
  const [facing, setFacing] = useState<CameraFacing>('environment');
  const { stream, error, retry } = useCameraStream(facing);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  const [showStoriesNotice, setShowStoriesNotice] = useState(false);
  const storiesNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) video.play().catch(() => {});
  }, [stream]);

  const { isRecording, elapsedMs, start: startRecording, stop: stopRecording } = useVideoCapture({
    stream,
    previewVideoRef: videoRef,
    onCaptured: (result) => {
      if (!result) return;
      onCapturedVideo(createDraftMediaFromCapture(result.file, 'video', result.posterBlob));
    },
  });

  const handleShutterTap = async () => {
    if (mode === 'photo') {
      if (!videoRef.current || capturingPhoto) return;
      setCapturingPhoto(true);
      const blob = await capturePhotoBlob(videoRef.current);
      setCapturingPhoto(false);
      if (!blob) return;
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapturedPhoto(createDraftMediaFromCapture(file, 'image'));
      return;
    }

    if (isRecording) {
      stopRecording();
      return;
    }
    if (mode === 'video') {
      void startRecording();
      return;
    }
    // Stories: a publicação de verdade chega num PR seguinte (schema, RLS e
    // expiração de 24h ainda não existem) — aqui só sinaliza a intenção.
    setShowStoriesNotice(true);
    if (storiesNoticeTimerRef.current) window.clearTimeout(storiesNoticeTimerRef.current);
    storiesNoticeTimerRef.current = window.setTimeout(() => setShowStoriesNotice(false), STORIES_NOTICE_MS);
  };

  useEffect(() => {
    return () => {
      if (storiesNoticeTimerRef.current) window.clearTimeout(storiesNoticeTimerRef.current);
    };
  }, []);

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

        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pb-3 pt-safe-top">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar câmera"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white"
          >
            <X size={20} aria-hidden />
          </button>

          {isRecording && (
            <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-error" aria-hidden />
              <span className="font-sans text-counter text-white">{formatElapsed(elapsedMs)}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setFacing((prev) => (prev === 'user' ? 'environment' : 'user'))}
            aria-label="Trocar câmera"
            disabled={isRecording}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white disabled:opacity-40"
          >
            <RotateCcw size={20} aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 bg-black pb-safe-bottom pt-4">
        {showStoriesNotice && (
          <p className="rounded-full bg-white/10 px-4 py-1.5 font-sans text-body-sm text-white">
            Stories chega em breve
          </p>
        )}
        <CameraModeSwitcher mode={mode} onChange={onModeChange} />

        <div className="flex w-full items-center justify-center gap-10 px-8 pb-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Escolher da galeria"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/25 text-white"
          >
            <Images size={20} aria-hidden />
          </button>

          <button
            type="button"
            onClick={handleShutterTap}
            aria-label={mode === 'photo' ? 'Capturar foto' : isRecording ? 'Parar gravação' : 'Iniciar gravação'}
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-white/10 transition-transform active:scale-95"
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

          <div className="h-11 w-11" aria-hidden />
        </div>
      </div>
    </div>
  );
}
