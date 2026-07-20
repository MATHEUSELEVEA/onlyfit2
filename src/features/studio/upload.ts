import { supabase } from '@/lib/supabase';

// Envio de mídia para o R2 via edge function compartilhada com o v1
// (create-r2-upload-url): a função devolve uma URL PUT assinada e a URL pública
// final. O cliente nunca vê credencial de storage.

type Bucket = 'onlyfit-media' | 'onlyfit-thumbnails' | 'onlyfit-avatar';

function shouldUploadThroughFunction(file: Blob): boolean {
  if (typeof window === 'undefined') return false;
  const protocol = window.location.protocol;
  return (protocol === 'capacitor:' || protocol === 'ionic:') && file.size <= 20 * 1024 * 1024;
}

// PUT via XMLHttpRequest em vez de fetch: é o único jeito de expor progresso
// de upload de forma confiável no WebKit (a Progress API de fetch para upload
// não tem suporte consistente em WKWebView/Safari).
function putWithProgress(
  url: string,
  file: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('Falha ao enviar o arquivo. Tente novamente.'));
    };
    xhr.onerror = () => reject(new Error('Falha ao enviar o arquivo. Tente novamente.'));
    xhr.send(file);
  });
}

export async function uploadAsset(
  file: Blob,
  filename: string,
  contentType: string,
  bucket: Bucket,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  if (shouldUploadThroughFunction(file)) {
    const form = new FormData();
    form.append('file', file, filename);
    form.append('filename', filename);
    form.append('content_type', contentType);
    form.append('target_bucket', bucket);
    form.append('content_length', String(file.size));

    const { data, error } = await supabase.functions.invoke('create-r2-upload-url', {
      body: form,
    });
    if (error) throw error;
    onProgress?.(1);

    const { publicUrl } = data as { publicUrl: string };
    return publicUrl;
  }

  const { data, error } = await supabase.functions.invoke('create-r2-upload-url', {
    body: {
      filename,
      content_type: contentType,
      target_bucket: bucket,
      content_length: file.size,
    },
  });
  if (error) throw error;

  const { uploadUrl, publicUrl } = data as { uploadUrl: string; publicUrl: string };
  await putWithProgress(uploadUrl, file, contentType, onProgress);

  return publicUrl;
}

// Captura o primeiro quadro de um vídeo local como poster (thumbnail_url). É
// best-effort: se o navegador não conseguir decodificar, devolve null e o post
// segue sem poster. Roda sobre object URL (mesma origem), então o canvas não é
// marcado como "tainted".
//
// Usada apenas para o caminho legado (vídeo escolhido da galeria/picker). Para
// vídeo gravado pela câmera (CameraStep/useVideoCapture), o poster já vem
// capturado ao vivo do stream — ver DraftMedia.posterBlob — e este caminho é
// pulado inteiramente.
function capturePosterFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, video.duration || 0.1);
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0) {
        cleanup();
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          cleanup();
          resolve(blob);
        },
        'image/jpeg',
        0.85,
      );
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

// Timeout de segurança: vídeos .mov/HEVC que a WebView não decodifica bem
// podem nunca disparar onloadeddata/onseeked, deixando essa promise pendente
// para sempre — e como o post inteiro esperava por ela, o "Publicando…"
// travava eternamente. A função já é best-effort (null = "sem poster, segue o
// post"), então o timeout só adianta essa resposta em vez de travar o fluxo.
export function captureVideoPoster(file: File, timeoutMs = 4000): Promise<Blob | null> {
  return Promise.race([
    capturePosterFrame(file),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}
