import { DEFAULT_MEDIA_FRAMING, FEED_ASPECT_RATIO, sanitizeMediaFraming } from '@/features/mediaFraming';
import type { DraftMedia } from './media';

// Máx. altura do arquivo assado (largura sai proporcional ao 9:16). Fontes
// menores não são ampliadas — mantém a qualidade original.
const MAX_OUT_HEIGHT = 1920;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('imagem inválida'));
    img.src = src;
  });
}

// Assa uma imagem no formato ÚNICO do feed (9:16), preenchendo (cover) e
// aplicando o zoom/offset do enquadramento. Depois disso o arquivo já é 9:16 —
// o feed exibe uniforme, sem depender da tela nem de metadata de framing. Vídeo
// e mídias sem imagem passam intactos. Falha silenciosa devolve o draft original
// (melhor publicar cru do que travar a publicação).
export async function bakeImageDraftToFeed(draft: DraftMedia): Promise<DraftMedia> {
  if (draft.kind !== 'image') return draft;
  try {
    const framing = sanitizeMediaFraming(draft.framing) ?? DEFAULT_MEDIA_FRAMING;
    const image = await loadImage(draft.previewUrl);
    const iw = image.naturalWidth;
    const ih = image.naturalHeight;
    if (!iw || !ih) return draft;

    const outH = Math.min(MAX_OUT_HEIGHT, ih);
    const outW = Math.round(outH * FEED_ASPECT_RATIO);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return draft;

    // cover: escala para preencher o 9:16, multiplicada pelo zoom do usuário.
    const scale = Math.max(outW / iw, outH / ih) * (framing.zoom || 1);
    const dw = iw * scale;
    const dh = ih * scale;
    // offsetX/offsetY são % do quadro (mesma convenção do mediaFramingStyle).
    const cx = outW / 2 + (framing.offsetX / 100) * outW;
    const cy = outH / 2 + (framing.offsetY / 100) * outH;
    ctx.drawImage(image, cx - dw / 2, cy - dh / 2, dw, dh);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return draft;
    const baseName = draft.file.name.replace(/\.[^.]+$/, '') || 'photo';
    const file = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
    // framing zerado: já foi aplicado no pixel, o feed não deve reaplicar.
    return { ...draft, file, framing: null };
  } catch {
    return draft;
  }
}
