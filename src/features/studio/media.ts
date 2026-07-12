// Tipos e helpers puros do estúdio de criação de post.
//
// Este módulo é o "chão" do estúdio: a partir daqui é fácil evoluir para
// paridade com o TikTok (edição, filtros, música, melhorias por IA) plugando
// transformações sobre um DraftMedia antes do upload, sem tocar no feed nem no
// modelo de dados. Hoje só cobre o básico: escolher imagens/vídeos e ordenar.

export type MediaKind = 'image' | 'video';

// Uma página de mídia ainda em rascunho (local, não enviada). `previewUrl` é um
// object URL — quem cria é responsável por revogar (URL.revokeObjectURL).
export interface DraftMedia {
  id: string;
  file: File;
  kind: MediaKind;
  previewUrl: string;
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'm4v']);

export function fileExtension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? '';
}

// Deriva imagem x vídeo do MIME e, como fallback, da extensão (Safari às vezes
// omite o type). Retorna null quando não é uma mídia suportada.
export function inferMediaKind(file: File): MediaKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  const ext = fileExtension(file);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
}

let draftSeq = 0;

export function createDraftMedia(file: File): DraftMedia | null {
  const kind = inferMediaKind(file);
  if (!kind) return null;
  draftSeq += 1;
  return {
    id: `draft-${Date.now()}-${draftSeq}`,
    file,
    kind,
    previewUrl: URL.createObjectURL(file),
  };
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
