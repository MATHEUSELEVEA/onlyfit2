// Recorte WYSIWYG: corta um quadro (vídeo ao vivo OU imagem já carregada) na
// proporção do preview em tela, espelhando selfie. A foto sai exatamente como o
// usuário enquadrou, nunca o quadro cru do sensor. É o núcleo compartilhado
// pelos dois caminhos de câmera — web (getUserMedia + <video>) e nativo
// (camera-preview, que devolve a foto cheia do sensor).
export function cropFrameToView(
  source: CanvasImageSource,
  frameWidth: number,
  frameHeight: number,
  viewAspect: number,
  mirror: boolean,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (frameWidth === 0 || frameHeight === 0) {
      resolve(null);
      return;
    }
    let cropWidth = frameWidth;
    let cropHeight = frameHeight;
    if (frameWidth / frameHeight > viewAspect) {
      cropWidth = Math.round(frameHeight * viewAspect);
    } else {
      cropHeight = Math.round(frameWidth / viewAspect);
    }
    const cropX = Math.round((frameWidth - cropWidth) / 2);
    const cropY = Math.round((frameHeight - cropHeight) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(null);
      return;
    }
    if (mirror) {
      ctx.translate(cropWidth, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
  });
}

// Decodifica base64 (com ou sem prefixo data:) numa <img> pronta para desenhar.
export function decodeBase64Image(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('imagem inválida'));
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}
