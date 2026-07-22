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
// · Foto → paisagem 4:3 (1440×1080), o formato NATIVO de foto do iPhone (as
//   duas câmeras leem o sensor inteiro em 4:3). Pedir retrato (9:16) fazia o
//   WebKit do iOS recortar o centro do sensor pra satisfazer a constraint — o
//   "zoom gigante". Além de matar o zoom, 4:3 é MAIS AMPLO que 16:9 no
//   resultado: o recorte WYSIWYG (CameraStep) usa a altura inteira do quadro e
//   uma fatia central da largura, e um quadro 4:3 (mais estreito em pixels,
//   mesmo ângulo horizontal) entrega mais campo de visão nessa fatia do que um
//   16:9. A proporção da fonte não muda o formato do post (o recorte cuida
//   disso) — só o FOV.
// · Vídeo/Stories → retrato (1080×1920), porque o MediaRecorder grava o stream
//   cru: o arquivo precisa sair igual ao preview.
//
// `deviceId` (opcional): abre EXATAMENTE aquela lente em vez de deixar o
// facingMode escolher a padrão — usado pela ultra-angular 0.5× traseira, quando
// o WebView a expõe (ver lens.ts).
export function useCameraStream(
  facing: CameraFacing,
  portrait: boolean,
  deviceId?: string | null,
  options?: { enabled?: boolean },
) {
  // No app nativo a câmera vem do camera-preview (useNativeCameraPreview) — aqui
  // fica desligado para não abrir uma segunda captura via getUserMedia.
  const enabled = options?.enabled ?? true;
  const [state, setState] = useState<CameraStreamState>({ stream: null, error: null, loading: true });
  // Incrementar força o efeito a rodar de novo mesmo com facing inalterado
  // (botão "Tentar de novo" após erro de permissão/dispositivo).
  const [retryTick, setRetryTick] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      // setState fora do corpo síncrono do efeito (mesma convenção do resto).
      Promise.resolve().then(() => setState({ stream: null, error: null, loading: false }));
      return;
    }
    const generation = ++generationRef.current;

    // Todo setState roda dentro de .then()/.catch() (depois de um gap
    // assíncrono), nunca sincronamente no corpo do efeito — mesmo padrão já
    // usado em AuthContext.tsx (supabase.auth.getSession().then(...)).
    Promise.resolve()
      .then(() => {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        return navigator.mediaDevices.getUserMedia({
          video: {
            // Lente exata (ex.: ultra-angular) tem prioridade; senão, facingMode
            // deixa o iOS escolher a lente padrão daquele lado.
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing } }),
            width: { ideal: portrait ? 1080 : 1440 },
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
  }, [facing, portrait, deviceId, enabled, retryTick]);

  const retry = useCallback(() => setRetryTick((tick) => tick + 1), []);

  return { stream: state.stream, error: state.error, loading: state.loading, retry };
}
