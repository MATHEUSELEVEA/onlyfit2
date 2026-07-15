import { useSyncExternalStore } from 'react';

// Preferência global de som dos vídeos: a decisão do usuário vale para o app
// inteiro (padrão do Reels/TikTok), não por vídeo. Começa com som ligado; se o
// navegador bloquear o autoplay com áudio, o player cai para mudo sozinho e o
// botão de som volta a ligar no primeiro toque.
let muted = false;
// Depois que o usuário toca no botão de som a escolha é dele: um autoplay
// bloqueado (vídeo que entra na tela sem gesto recente) não pode mais desfazê-la.
let chosenByUser = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function set(next: boolean): void {
  if (muted === next) return;
  muted = next;
  listeners.forEach((listener) => listener());
}

// Toque no botão de som.
export function setVideoMuted(next: boolean): void {
  chosenByUser = true;
  set(next);
}

// Autoplay com áudio barrado pelo navegador: reflete o mudo no botão, exceto
// quando o usuário já pediu som explicitamente.
export function muteAfterAutoplayBlock(): void {
  if (chosenByUser) return;
  set(true);
}

export function useVideoMuted(): boolean {
  return useSyncExternalStore(subscribe, () => muted);
}
