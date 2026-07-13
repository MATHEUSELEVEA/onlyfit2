import { uploadAsset } from '@/features/studio/upload';
import type { MediaType } from './types';

// Upload de anexo de DM. Reusa a edge function create-r2-upload-url (bucket
// público onlyfit-media, R2) — a mesma infra de mídia do resto do app. O
// cliente nunca vê credencial de storage.

export function mediaTypeFromMime(mime: string): MediaType | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
};

function extFor(mime: string): string {
  return EXT_BY_MIME[mime] ?? mime.split('/')[1] ?? 'bin';
}

/** Sobe um blob de mídia e devolve a URL pública final. */
export async function uploadMessageMedia(blob: Blob, mime: string): Promise<string> {
  const filename = `dm-${Date.now()}-${Math.round(Math.random() * 1e6)}.${extFor(mime)}`;
  return uploadAsset(blob, filename, mime, 'onlyfit-media');
}

/** Dimensões de uma imagem local, para o media_meta (evita "pulo" de layout). */
export function readImageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
