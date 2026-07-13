import { useCallback, useEffect, useRef, useState } from 'react';

// Gravação de nota de voz via MediaRecorder (segurar para gravar). Escolhe um
// container suportado pelo navegador (audio/webm no Chrome, audio/mp4 no Safari)
// e devolve o blob + mime + duração ao finalizar. O upload/envio fica no composer.

export interface RecordingResult {
  blob: Blob;
  mime: string;
  durationMs: number;
}

function pickMimeType(): string {
  const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg'];
  const supported = typeof MediaRecorder !== 'undefined';
  if (!supported) return 'audio/webm';
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? 'audio/webm';
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const resolveRef = useRef<((r: RecordingResult | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    setError(null);
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: mime });
        const result: RecordingResult | null =
          cancelledRef.current || blob.size === 0 ? null : { blob, mime, durationMs };
        cleanup();
        setIsRecording(false);
        setElapsedMs(0);
        resolveRef.current?.(result);
        resolveRef.current = null;
      };

      startedAtRef.current = Date.now();
      recorder.start();
      setIsRecording(true);
      setElapsedMs(0);
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
    } catch {
      cleanup();
      setIsRecording(false);
      setError('mic');
    }
  }, [cleanup]);

  // Para a gravação e resolve com o áudio; `stop(true)` cancela (descarta).
  const stop = useCallback((cancel = false): Promise<RecordingResult | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return Promise.resolve(null);
    }
    cancelledRef.current = cancel;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      recorder.stop();
    });
  }, []);

  useEffect(() => cleanup, [cleanup]);

  return { isRecording, elapsedMs, error, start, stop };
}
