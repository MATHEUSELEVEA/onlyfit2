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
  // Estado do usuário logado sobre o post (hidratado no fetch, atualizado
  // de forma otimista por useToggleLike).
  likedByMe: boolean;
}
