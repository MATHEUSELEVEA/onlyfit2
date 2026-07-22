import { useEffect, useRef, useState } from 'react';
import { Images, Loader2, SwitchCamera, X, Zap, ZapOff } from 'lucide-react';
import { clsx } from 'clsx';
import { CameraModeSwitcher } from './CameraModeSwitcher';
import { useCameraStream, type CameraFacing } from './useCameraStream';
import { useNativeCameraPreview } from './useNativeCameraPreview';
import { isNativeCamera } from './nativeCamera';
import { findUltraWideCameraId } from './lens';
import { cropFrameToView, viewportAspect } from './frameCrop';
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

/**
 * Captura WYSIWYG: recorta o quadro exatamente como o preview `object-cover`
 * mostra (mesma proporção da tela) — a foto sai igual ao que o usuário
 * enquadrou, nunca o quadro paisagem cru do sensor. Selfie sai espelhada
 * como no preview.
 */
function capturePhotoBlob(video: HTMLVideoElement, mirror: boolean): Promise<Blob | null> {
  const viewAspect =
    video.clientWidth > 0 && video.clientHeight > 0 ? video.clientWidth / video.clientHeight : viewportAspect();
  return cropFrameToView(video, video.videoWidth, video.videoHeight, viewAspect, mirror);
}

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Tela de câmera full-screen: primeiro passo do Studio (substitui a entrada
// direta no picker de galeria). Captura de foto/vídeo local, com a galeria como
// opção secundária — igual ao Instagram, câmera é o padrão, mas nunca a única
// saída. Dois motores atrás da MESMA UI: no app iOS/Android usa a câmera NATIVA
// (camera-preview → AVFoundation), no navegador cai no getUserMedia.
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
  // Câmera nativa no app instalado; getUserMedia no navegador. A UI abaixo é a
  // mesma — só o motor de captura muda.
  const native = isNativeCamera();

  // Lente ultra-angular (0,5×) traseira — descoberta via enumerateDevices no
  // caminho web (ver lens.ts). O camera-preview ainda não expõe seleção de
  // lente, então no nativo o toggle não aparece (ultraWideId fica null).
  const [ultraWideId, setUltraWideId] = useState<string | null>(null);
  const [ultraWide, setUltraWide] = useState(false);
  const useUltraWide = facing === 'environment' && ultraWide && !!ultraWideId;

  const nativeCam = useNativeCameraPreview({ enabled: native, facing, withAudio: mode !== 'photo' });
  const { stream, error: webError, retry: webRetry } = useCameraStream(
    facing,
    mode !== 'photo',
    useUltraWide ? ultraWideId : null,
    { enabled: !native },
  );
  const error = native ? nativeCam.error : webError;
  const retry = native ? nativeCam.retry : webRetry;
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [screenFlash, setScreenFlash] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Só as trilhas de vídeo vão pro preview: um <video> com trilha de áudio ao
    // vivo faz o iOS tratar como reprodução de mídia e sobrepor controles de
    // play/pause. O áudio continua no `stream` original (usado pelo gravador em
    // useVideoCapture), só não é espelhado no elemento de preview.
    if (!stream) {
      video.srcObject = null;
      return;
    }
    video.srcObject = new MediaStream(stream.getVideoTracks());
    video.play().catch(() => {});
  }, [stream]);

  // Câmera nativa: o preview é renderizado ATRÁS do webview (`toBack`), então
  // toda a pilha visível precisa ficar transparente enquanto a câmera está
  // aberta. A classe é removida ao sair — o app volta ao fundo normal. Ver a
  // regra `html.native-camera-active` em index.css.
  useEffect(() => {
    if (!native) return;
    const root = document.documentElement;
    root.classList.add('native-camera-active');
    return () => root.classList.remove('native-camera-active');
  }, [native]);

  // Procura a ultra-angular só depois que a traseira abriu (enumerateDevices só
  // devolve labels com a permissão já concedida). Uma vez achada, não repete.
  useEffect(() => {
    if (facing !== 'environment' || !stream || ultraWideId) return;
    let cancelled = false;
    void findUltraWideCameraId().then((id) => {
      if (!cancelled && id) setUltraWideId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [facing, stream, ultraWideId]);

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

  const {
    isRecording: webRecording,
    elapsedMs: webElapsed,
    start: startRecording,
    stop: stopRecording,
  } = useVideoCapture({
    stream,
    previewVideoRef: videoRef,
    onCaptured: (result) => {
      if (!result) return;
      onCapturedVideo(createDraftMediaFromCapture(result.file, 'video', result.posterBlob));
    },
  });
  // Estado de gravação unificado: vem do motor nativo ou do web conforme a
  // plataforma. A UI (tempo, botão) não sabe qual está por baixo.
  const isRecording = native ? nativeCam.isRecording : webRecording;
  const elapsedMs = native ? nativeCam.elapsedMs : webElapsed;

  const handleShutterTap = async () => {
    if (storyPublishing) return;

    if (mode === 'photo') {
      if (capturingPhoto || (!native && !videoRef.current)) return;
      setCapturingPhoto(true);
      let file: File | null;
      if (native) {
        // Câmera nativa dispara o flash real do aparelho na captura.
        if (flashOn) await nativeCam.setFlash('on');
        file = await nativeCam.capturePhoto(facing === 'user');
        if (flashOn) void nativeCam.setFlash('off');
      } else {
        // Web: clarão de tela (selfie) + tentativa de torch, e recorte do <video>.
        if (flashOn) {
          setScreenFlash(true);
          await new Promise((resolve) => setTimeout(resolve, SCREEN_FLASH_MS));
          void applyTorch(true);
        }
        const blob = await capturePhotoBlob(videoRef.current!, facing === 'user');
        if (flashOn) {
          void applyTorch(false);
          setScreenFlash(false);
        }
        file = blob ? new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' }) : null;
      }
      setCapturingPhoto(false);
      if (!file) return;
      onCapturedPhoto(createDraftMediaFromCapture(file, 'image'));
      return;
    }

    // Vídeo e Stories gravam do mesmo jeito (Stories é vídeo com validade de
    // 24h); o que muda é o destino da mídia, decidido no StudioPage pelo modo.
    if (isRecording) {
      if (native) {
        if (flashOn) void nativeCam.setFlash('off');
        const file = await nativeCam.stopVideo();
        if (file) onCapturedVideo(createDraftMediaFromCapture(file, 'video'));
      } else {
        void applyTorch(false);
        stopRecording();
      }
      return;
    }
    if (native) {
      if (flashOn) void nativeCam.setFlash('torch');
      void nativeCam.startVideo();
    } else {
      if (flashOn) void applyTorch(true);
      void startRecording();
    }
  };

  return (
    <div className={clsx('relative h-full overflow-hidden', native ? 'bg-transparent' : 'bg-black')}>
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

      {/* Preview full-bleed 9:16: a câmera ocupa a tela inteira (mesmo palco do
          feed), e os controles flutuam por cima — estilo Reels/TikTok. */}
      {stream && (
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className={clsx('absolute inset-0 h-full w-full object-cover', facing === 'user' && '-scale-x-100')}
        />
      )}

      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 px-8 text-center">
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

      {/* Scrims sutis topo/base: legibilidade dos controles flutuantes sem
          esconder a mídia (a estrela é o enquadramento). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-36 bg-gradient-to-b from-black/55 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-72 bg-gradient-to-t from-black/70 via-black/25 to-transparent" aria-hidden />

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

      {/* Barra superior flutuante: fechar (esq.) · flash ou tempo (centro) */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pb-3 pt-safe-top">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar câmera"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-transform active:scale-95"
        >
          <X size={20} aria-hidden />
        </button>

        {isRecording ? (
          <div className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-error motion-reduce:animate-none" aria-hidden />
            <span className="font-sans text-counter tabular-nums text-white">{formatElapsed(elapsedMs)}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFlashOn((prev) => !prev)}
            aria-label={flashOn ? 'Desligar flash' : 'Ligar flash'}
            aria-pressed={flashOn}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-transform active:scale-95"
          >
            {flashOn ? <Zap size={20} aria-hidden /> : <ZapOff size={20} aria-hidden />}
          </button>
        )}

        <div className="h-10 w-10" aria-hidden />
      </div>

      {/* Controles flutuantes na base (sobre o scrim): modos + galeria/obturador/virar. */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-5 pb-safe-bottom pt-4">
        {/* Seletor de lente: só a traseira tem ultra-angular (0,5×), e só quando
            o WebView a expõe. Some no modo frontal e onde a lente não existe. */}
        {facing === 'environment' && ultraWideId && !isRecording && (
          <div className="flex items-center gap-1 rounded-full bg-black/35 p-1 backdrop-blur-sm">
            {([
              { wide: true, label: '0,5×' },
              { wide: false, label: '1×' },
            ] as const).map((lens) => (
              <button
                key={lens.label}
                type="button"
                onClick={() => setUltraWide(lens.wide)}
                aria-pressed={ultraWide === lens.wide}
                className={clsx(
                  'min-h-[34px] rounded-full px-3 font-sans text-counter tabular-nums transition-colors',
                  ultraWide === lens.wide ? 'bg-white text-black' : 'text-white',
                )}
              >
                {lens.label}
              </button>
            ))}
          </div>
        )}

        <CameraModeSwitcher mode={mode} onChange={onModeChange} />

        <div className="grid w-full grid-cols-3 items-center px-8 pb-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Escolher da galeria"
            className="flex h-12 w-12 items-center justify-center justify-self-start overflow-hidden rounded-xl border-2 border-white/80 bg-white/10 text-white backdrop-blur-sm transition-transform active:scale-95"
          >
            <Images size={22} aria-hidden />
          </button>

          <button
            type="button"
            onClick={handleShutterTap}
            aria-label={mode === 'photo' ? 'Capturar foto' : isRecording ? 'Parar gravação' : 'Iniciar gravação'}
            className="flex h-[76px] w-[76px] items-center justify-center justify-self-center rounded-full border-[5px] border-white bg-white/10 transition-transform active:scale-95"
          >
            <span
              className={clsx(
                'transition-all duration-200',
                isRecording && 'h-7 w-7 rounded-md bg-error',
                !isRecording && mode === 'photo' && 'h-[58px] w-[58px] rounded-full bg-white',
                !isRecording && mode !== 'photo' && 'h-[58px] w-[58px] rounded-full bg-error',
              )}
              aria-hidden
            />
          </button>

          <button
            type="button"
            onClick={() => setFacing((prev) => (prev === 'user' ? 'environment' : 'user'))}
            aria-label="Virar câmera"
            disabled={isRecording}
            className="flex h-12 w-12 items-center justify-center justify-self-end rounded-full bg-white/15 text-white backdrop-blur-sm transition-transform active:scale-95 disabled:opacity-40"
          >
            <SwitchCamera size={22} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
