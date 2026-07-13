import { useCallback, useEffect, useRef, useState } from 'react';

function supportedMime() {
  const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg'];
  if (typeof MediaRecorder === 'undefined') return '';
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function useHealthAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    const mime = supportedMime();
    if (!mime || !navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não oferece gravação de áudio compatível.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
    recorder.start();
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setIsRecording(true);
    timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
  }, []);

  const stop = useCallback(() => new Promise<{ blob: Blob; mime: string } | null>((resolve) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return resolve(null);
    const mime = recorder.mimeType;
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      cleanup();
      setIsRecording(false);
      setElapsedMs(0);
      resolve(blob.size ? { blob, mime } : null);
    };
    recorder.stop();
  }), [cleanup]);

  useEffect(() => cleanup, [cleanup]);
  return { isRecording, elapsedMs, start, stop };
}
