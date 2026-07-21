import { useSyncExternalStore } from 'react';

// Preferência global de legendas (CC) dos vídeos — estilo TikTok/Reels: ligada
// por padrão, e a escolha do usuário vale para o app inteiro (não por vídeo).
// A faixa de legenda vem do Cloudflare Stream (transcrição automática da fala).
let captionsOn = true;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setCaptionsOn(next: boolean): void {
  if (captionsOn === next) return;
  captionsOn = next;
  listeners.forEach((listener) => listener());
}

export function useCaptionsOn(): boolean {
  return useSyncExternalStore(subscribe, () => captionsOn);
}
