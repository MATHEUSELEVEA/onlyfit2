import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

// Gravação de vídeo pela câmera, no mesmo formato do useVoiceRecorder.ts
// (MediaRecorder + chunksRef + isTypeSupported), mas: (1) recebe um stream já
// aberto por useCameraStream em vez de abrir um novo; (2) captura o poster ao
// vivo do próprio preview no instante em que a gravação começa, para o post
// não depender de captureVideoPoster (que abre o arquivo depois — best-effort
// e pode travar em .mov/HEVC que a WebView não decodifica); (3) para sozinho
// em maxDurationMs, que é a trava dura de tamanho de arquivo.

export interface CapturedVideo {
  file: File;
  posterBlob: Blob | null;
  durationMs: number;
}

function pickVideoMimeType(): string {
  const candidates = ['video/mp4;codecs=h264,aac', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return 'video/mp4';
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? 'video/mp4';
}

function grabPosterFrame(video: HTMLVideoElement): Promise<Blob | null> {
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

interface UseVideoCaptureOptions {
  stream: MediaStream | null;
  previewVideoRef: RefObject<HTMLVideoElement | null>;
  /** Chamado quando a gravação termina — por tap no obturador ou auto-stop. */
  onCaptured: (result: CapturedVideo | null) => void;
  maxDurationMs?: number;
}

export function useVideoCapture({ stream, previewVideoRef, onCaptured, maxDurationMs = 60_000 }: UseVideoCaptureOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const posterRef = useRef<Blob | null>(null);
  const startedAtRef = useRef(0);
  const tickTimerRef = useRef<number | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  // "Latest ref" para o callback: mutado em efeito (fase de commit), nunca
  // durante o render, para o onstop do MediaRecorder sempre chamar a versão
  // mais recente sem precisar recriar o recorder a cada render.
  const onCapturedRef = useRef(onCaptured);
  useEffect(() => {
    onCapturedRef.current = onCaptured;
  }, [onCaptured]);

  const clearTimers = useCallback(() => {
    if (tickTimerRef.current) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    if (autoStopTimerRef.current) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (!stream || recorderRef.current) return;
    const mime = pickVideoMimeType();
    // Bitrate proporcional à resolução real do stream (~0.1 bit/pixel/frame),
    // com teto de 10 Mbps: nitidez alta em 1080p sem gerar arquivo gigante.
    // A fonte em alta qualidade importa porque o Cloudflare Stream re-encoda
    // em adaptativo a partir dela.
    const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
    const width = settings.width ?? 1080;
    const height = settings.height ?? 1920;
    const frameRate = settings.frameRate ?? 30;
    const videoBitsPerSecond = Math.max(4_000_000, Math.min(10_000_000, Math.round(width * height * frameRate * 0.1)));
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond,
      audioBitsPerSecond: 160_000,
    });
    recorderRef.current = recorder;
    chunksRef.current = [];
    posterRef.current = previewVideoRef.current ? await grabPosterFrame(previewVideoRef.current) : null;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      clearTimers();
      const durationMs = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: mime });
      recorderRef.current = null;
      chunksRef.current = [];
      setIsRecording(false);
      setElapsedMs(0);
      if (blob.size === 0) {
        onCapturedRef.current(null);
        return;
      }
      const extension = mime.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `video_${Date.now()}.${extension}`, { type: mime });
      onCapturedRef.current({ file, posterBlob: posterRef.current, durationMs });
    };

    startedAtRef.current = Date.now();
    recorder.start();
    setIsRecording(true);
    setElapsedMs(0);
    tickTimerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200);
    autoStopTimerRef.current = window.setTimeout(stop, maxDurationMs);
  }, [stream, previewVideoRef, clearTimers, stop, maxDurationMs]);

  useEffect(() => {
    return () => {
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    };
  }, [clearTimers]);

  return { isRecording, elapsedMs, start, stop };
}
