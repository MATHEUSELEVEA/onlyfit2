import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraPreview, type CameraPreviewOptions } from '@capacitor-community/camera-preview';
import { Capacitor } from '@capacitor/core';
import type { CameraError, CameraFacing } from './useCameraStream';
import { cropFrameToView, decodeBase64Image } from './frameCrop';
import { FEED_ASPECT_RATIO } from '@/features/mediaFraming';

export type FlashMode = 'off' | 'on' | 'torch';

interface NativeCameraOptions {
  enabled: boolean;
  facing: CameraFacing;
  // Áudio só liga no modo vídeo — evita pedir permissão de microfone à toa na
  // foto (e é o que dispensava o preview de mídia que causava o "pause").
  withAudio: boolean;
  // Lente ultra-angular (0,5×) na traseira. Depende do patch Swift do plugin
  // (ver patches/@capacitor-community+camera-preview...); em aparelho sem a
  // lente o nativo cai na 1× sozinho.
  ultraWide: boolean;
}

export interface NativeCameraApi {
  ready: boolean;
  error: CameraError | null;
  isRecording: boolean;
  elapsedMs: number;
  // Recorta a foto cheia do sensor na proporção do preview (WYSIWYG), espelhando
  // selfie — igual ao caminho web.
  capturePhoto(mirror: boolean): Promise<File | null>;
  startVideo(): Promise<boolean>;
  stopVideo(): Promise<File | null>;
  setFlash(mode: FlashMode): Promise<void>;
  retry(): void;
}

function positionFor(facing: CameraFacing): 'front' | 'rear' {
  return facing === 'user' ? 'front' : 'rear';
}

function fullScreenSize() {
  return { x: 0, y: 0, width: Math.round(window.screen.width), height: Math.round(window.screen.height) };
}

// Câmera NATIVA via camera-preview (AVFoundation por baixo, preview renderizado
// atrás do webview com `toBack`). Espelha a mesma interface que a CameraStep
// consome no caminho web, para o componente só trocar o motor sem mudar a UI.
export function useNativeCameraPreview({ enabled, facing, withAudio, ultraWide }: NativeCameraOptions): NativeCameraApi {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [retryTick, setRetryTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  // Ciclo de vida do preview: (re)inicia ao habilitar, trocar de câmera ou mudar
  // a necessidade de áudio; para ao desmontar. Um `stop()` inicial limpa
  // qualquer preview órfão de uma montagem anterior.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    // Todo setState roda dentro de .then() (nunca síncrono no corpo do efeito),
    // mesma convenção do useCameraStream.
    void Promise.resolve()
      .then(() => {
        setReady(false);
        setError(null);
      })
      .then(() => CameraPreview.stop().catch(() => {}))
      .then(() => {
        // `useUltraWideLens` é lido pelo patch Swift; só faz efeito na traseira.
        const startOptions: CameraPreviewOptions & { useUltraWideLens?: boolean } = {
          ...fullScreenSize(),
          position: positionFor(facing),
          toBack: true,
          enableHighResolution: true,
          disableAudio: !withAudio,
          storeToFile: false,
          useUltraWideLens: ultraWide && facing !== 'user',
        };
        return CameraPreview.start(startOptions);
      })
      .then(() => {
        if (cancelled) {
          void CameraPreview.stop().catch(() => {});
          return;
        }
        setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message.toLowerCase() : '';
        setError(/denied|permission|authoriz|not allowed/.test(message) ? 'denied' : 'unavailable');
      });

    return () => {
      cancelled = true;
      void CameraPreview.stop().catch(() => {});
    };
  }, [enabled, facing, withAudio, ultraWide, retryTick]);

  // Backstop: nunca deixa o timer de gravação vazar ao desmontar.
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const capturePhoto = useCallback(async (mirror: boolean): Promise<File | null> => {
    try {
      const { value } = await CameraPreview.capture({ quality: 92 });
      const image = await decodeBase64Image(value);
      // 9:16 fixo (padrão do feed), não a proporção da tela do aparelho.
      const blob = await cropFrameToView(image, image.naturalWidth, image.naturalHeight, FEED_ASPECT_RATIO, mirror);
      return blob ? new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' }) : null;
    } catch {
      return null;
    }
  }, []);

  const startVideo = useCallback(async (): Promise<boolean> => {
    try {
      await CameraPreview.startRecordVideo({ ...fullScreenSize(), position: positionFor(facing) });
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setIsRecording(true);
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200);
      return true;
    } catch {
      return false;
    }
  }, [facing]);

  const stopVideo = useCallback(async (): Promise<File | null> => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    try {
      // A tipagem publicada diz void, mas em iOS/Android resolve com o caminho do
      // arquivo .mp4 gravado — que lemos via convertFileSrc + fetch para um Blob.
      const result = (await CameraPreview.stopRecordVideo()) as unknown as { videoFilePath?: string };
      const path = result?.videoFilePath;
      if (!path) return null;
      const response = await fetch(Capacitor.convertFileSrc(path));
      const blob = await response.blob();
      return new File([blob], `video_${Date.now()}.mp4`, { type: 'video/mp4' });
    } catch {
      return null;
    }
  }, []);

  const setFlash = useCallback(async (mode: FlashMode): Promise<void> => {
    try {
      await CameraPreview.setFlashMode({ flashMode: mode });
    } catch {
      // Nem toda lente/aparelho tem flash — silencioso, igual ao torch web.
    }
  }, []);

  const retry = useCallback(() => setRetryTick((tick) => tick + 1), []);

  return { ready, error, isRecording, elapsedMs, capturePhoto, startVideo, stopVideo, setFlash, retry };
}
