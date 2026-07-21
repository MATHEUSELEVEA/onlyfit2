import type { Area } from 'react-easy-crop';

// Recorta uma imagem a partir da área escolhida no cropper (pan/zoom) e devolve
// um JPEG. Mesma técnica do AvatarEditor, mas para o alvo 9:16 do feed: a saída
// tem exatamente os pixels selecionados (limitados a 1080 de largura), então o
// que o usuário enquadra é o que publica (WYSIWYG).
const MAX_WIDTH = 1080;

export function cropImageToBlob(imageSrc: string, area: Area): Promise<Blob | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const scale = area.width > MAX_WIDTH ? MAX_WIDTH / area.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(area.width * scale));
      canvas.height = Math.max(1, Math.round(area.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(
        image,
        area.x, area.y, area.width, area.height,
        0, 0, canvas.width, canvas.height,
      );
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
    };
    image.onerror = () => resolve(null);
    image.src = imageSrc;
  });
}
