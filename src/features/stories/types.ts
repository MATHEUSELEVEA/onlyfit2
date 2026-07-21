export type StoryMediaKind = 'image' | 'video';

// Um story ativo já resolvido para aparecer como mais um item do feed
// principal — não existe tela/viewer dedicado; o Story se mistura na mesma
// ordenação dos posts, diferenciado só pelo relógio de tempo restante.
export interface StoryFeedItem {
  id: string;
  creatorId: string;
  username: string;
  avatarUrl: string | null;
  mediaType: StoryMediaKind;
  mediaUrl: string;
  thumbnailUrl: string | null;
  // HLS normalizado do Cloudflare Stream (orientação em pé), quando pronto.
  hlsUrl: string | null;
  createdAt: string;
  expiresAt: string;
}
