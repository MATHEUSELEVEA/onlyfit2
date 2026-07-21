export interface FeedAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  verified: boolean;
}

export interface FeedProduct {
  id: string;
  title: string;
}

export type FeedMediaKind = 'image' | 'video';

// Uma página de mídia do post. Um post tem 1+ páginas: length 1 = mídia única
// (vídeo ou imagem), length > 1 = carrossel. `thumbnailUrl` é o poster do vídeo
// (ou null para imagens).
export interface FeedMedia {
  kind: FeedMediaKind;
  url: string;
  thumbnailUrl: string | null;
  // HLS já normalizado pelo Cloudflare Stream (orientação em pé). Quando
  // presente, o player prefere isto ao `url` cru do R2. Só vídeos.
  hlsUrl?: string | null;
  // Legenda autoral (falas + estilo) sobreposta ao vídeo, sincronizada.
  captions?: import('@/lib/captions').CaptionTrack | null;
}

export interface FeedPost {
  id: string;
  author: FeedAuthor;
  caption: string;
  // Sempre com ao menos um item quando há mídia; vazio só se o post não tem
  // nenhuma mídia utilizável. O carrossel é simplesmente media.length > 1.
  media: FeedMedia[];
  likeCount: number;
  commentCount: number;
  createdAt: string;
  product: FeedProduct | null;
  // Localização opcional do post (guardada em posts.metadata.location).
  location: string | null;
  // Estado do usuário logado sobre o post (hidratado no fetch, atualizado
  // de forma otimista por useToggleLike).
  likedByMe: boolean;
  // O autor pode desativar comentários no próprio post (flag em posts.metadata).
  commentsDisabled: boolean;
}
