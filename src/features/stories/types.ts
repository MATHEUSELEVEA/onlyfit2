export type StoryMediaKind = 'image' | 'video';

// Um creator com pelo menos um story ativo (expires_at > now(), visível para
// o usuário logado) — o que a barra de stories no feed lista.
export interface ActiveStoryCreator {
  creatorId: string;
  username: string;
  avatarUrl: string | null;
  // Existe ao menos um story deste creator que o usuário ainda não viu.
  hasUnseen: boolean;
  // Ids na ordem de publicação (mais antigo primeiro) — a fila de reprodução.
  storyIds: string[];
}

// Um story já resolvido para o viewer (StoryViewerPage) reproduzir.
export interface StoryItem {
  id: string;
  creatorId: string;
  mediaType: StoryMediaKind;
  mediaUrl: string;
  durationSeconds: number;
}
