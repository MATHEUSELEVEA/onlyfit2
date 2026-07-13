// Chaves de query da mensageria, centralizadas para o realtime invalidar sem
// divergência de string.
export const inboxKey = (userId?: string) => ['messages', 'inbox', userId] as const;
export const chatKey = (userId?: string, peerId?: string) =>
  ['messages', 'chat', userId, peerId] as const;
export const unreadKey = (userId?: string) => ['messages', 'unread', userId] as const;
export const peerKey = (peerId?: string) => ['messages', 'peer', peerId] as const;
