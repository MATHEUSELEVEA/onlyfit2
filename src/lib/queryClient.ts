import { QueryClient } from '@tanstack/react-query';

// Singleton do React Query, num módulo próprio (não dentro de App.tsx) para
// que código fora da árvore React — como a fila de publicação em background
// (features/studio/publishQueue.ts) — possa ler/escrever nos mesmos caches
// que os hooks usam via useQueryClient().
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});
