import { supabase } from '@/lib/supabase';

// Envio de mídia para o R2 via edge function compartilhada com o v1
// (create-r2-upload-url): a função devolve uma URL PUT assinada e a URL pública
// final. O cliente nunca vê credencial de storage.

type Bucket = 'onlyfit-media' | 'onlyfit-thumbnails';

export async function uploadAsset(
  file: Blob,
  filename: string,
  contentType: string,
  bucket: Bucket,
): Promise<string> {
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
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!put.ok) throw new Error('Falha ao enviar o arquivo. Tente novamente.');

  return publicUrl;
}

// Captura o primeiro quadro de um vídeo local como poster (thumbnail_url). É
// best-effort: se o navegador não conseguir decodificar, devolve null e o post
// segue sem poster. Roda sobre object URL (mesma origem), então o canvas não é
// marcado como "tainted".
export function captureVideoPoster(file: File): Promise<Blob | null> {
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
