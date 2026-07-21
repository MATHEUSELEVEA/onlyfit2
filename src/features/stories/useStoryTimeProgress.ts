import { useEffect, useState } from 'react';

const RECOMPUTE_INTERVAL_MS = 60_000;

function computeProgress(createdAt: string, expiresAt: string): number {
  const start = new Date(createdAt).getTime();
  const end = new Date(expiresAt).getTime();
  const now = Date.now();
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

// Sem viewer/sessão cronometrada, o relógio não mede reprodução — mede
// quanto das 24h de vida do story já passou (0 = recém-publicado, 1 = prestes
// a expirar). Um minuto de granularidade é mais que suficiente para uma
// janela de 24h; não precisa de requestAnimationFrame aqui.
export function useStoryTimeProgress(createdAt: string, expiresAt: string): number {
  const [progress, setProgress] = useState(() => computeProgress(createdAt, expiresAt));

  useEffect(() => {
    let cancelled = false;
    const recompute = () => {
      if (!cancelled) setProgress(computeProgress(createdAt, expiresAt));
    };
    // setState só depois de um gap assíncrono, nunca sincronamente no corpo
    // do efeito (mesmo padrão de AuthContext.tsx) — o valor inicial já vem
    // certo do useState acima, isto só resincroniza se createdAt/expiresAt
    // mudarem sem o componente remontar.
    void Promise.resolve().then(recompute);
    const id = window.setInterval(recompute, RECOMPUTE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [createdAt, expiresAt]);

  return progress;
}
