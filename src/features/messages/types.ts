// Tipos compartilhados da mensageria privada (DM). O banco é compartilhado com
// o desktop: a tabela `messages` ganhou as colunas media_url/media_type/media_meta
// (nullable) — mensagem de texto puro deixa todas nulas.

export type MediaType = 'image' | 'video' | 'audio';

export interface MediaMeta {
  mime?: string;
  size?: number;
  name?: string;
  duration_ms?: number;
  width?: number;
  height?: number;
  poster_url?: string;
}

export interface ChatMessage {
  id: string;
  body: string | null;
  media_url: string | null;
  media_type: MediaType | null;
  media_meta: MediaMeta | null;
  created_at: string;
  read: boolean;
  sender_id: string;
  receiver_id: string;
  /** Marca de mensagem otimista ainda não confirmada pelo servidor. */
  pending?: boolean;
}

export interface SendPayload {
  body?: string | null;
  media_url?: string | null;
  media_type?: MediaType | null;
  media_meta?: MediaMeta | null;
}

export interface PeerProfile {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface Conversation {
  peer: PeerProfile;
  lastMessage: string | null;
  lastMediaType: MediaType | null;
  timestamp: string;
  unread: number;
}
