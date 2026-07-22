import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraFacing = 'user' | 'environment';
export type CameraError = 'denied' | 'unavailable';

interface CameraStreamState {
  stream: MediaStream | null;
  error: CameraError | null;
  loading: boolean;
}

function mapError(error: unknown): CameraError {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  return 'unavailable';
}

// Abre e mantém o MediaStream de preview da câmera. Pede vídeo e áudio juntos
// (mesmo em modo Foto) para não pedir permissão de microfone separadamente
// depois, ao trocar para o modo Vídeo.
//
// Resolução por modo:
// · Foto → orientação NATIVA do sensor (paisagem, 1920×1080). Pedir retrato faz
//   o WebKit do iOS recortar o centro do sensor para satisfazer a constraint —
//   o famoso "zoom gigante". O enquadramento retrato fica por conta do preview
//   (object-cover) e do recorte WYSIWYG na captura (CameraStep).
// · Vídeo/Stories → retrato (1080×1920), porque o MediaRecorder grava o stream
//   cru: o arquivo precisa sair igual ao preview.
export function useCameraStream(facing: CameraFacing, portrait: boolean) {
  const [state, setState] = useState<CameraStreamState>({ stream: null, error: null, loading: true });
  // Incrementar força o efeito a rodar de novo mesmo com facing inalterado
  // (botão "Tentar de novo" após erro de permissão/dispositivo).
  const [retryTick, setRetryTick] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;

    // Todo setState roda dentro de .then()/.catch() (depois de um gap
    // assíncrono), nunca sincronamente no corpo do efeito — mesmo padrão já
    // usado em AuthContext.tsx (supabase.auth.getSession().then(...)).
    Promise.resolve()
      .then(() => {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        return navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: portrait ? 1080 : 1920 },
            height: { ideal: portrait ? 1920 : 1080 },
            frameRate: { ideal: 30, max: 60 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      })
      .then((stream) => {
        // Uma troca mais recente de câmera/retry já pode ter começado —
        // descarta este stream perdedor da corrida em vez de vazá-lo aberto.
        if (generationRef.current !== generation) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        setState({ stream, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (generationRef.current !== generation) return;
        setState({ stream: null, error: mapError(error), loading: false });
      });

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [facing, portrait, retryTick]);

  const retry = useCallback(() => setRetryTick((tick) => tick + 1), []);

  return { stream: state.stream, error: state.error, loading: state.loading, retry };
}
