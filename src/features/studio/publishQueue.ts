import { useSyncExternalStore } from 'react';
import { queryClient } from '@/lib/queryClient';
import { insertOptimisticPost, removeOptimisticPost } from '@/features/feed/useFeed';
import type { MyProfile } from '@/features/profile/useMyProfile';
import {
  buildOptimisticPost,
  getCreatePostErrorMessage,
  runCreatePost,
  type CreatePostInput,
} from './useCreatePost';

// Fila de publicação: vive fora da árvore React para que o upload+RPC de um
// post continue rodando mesmo que o usuário navegue embora da tela de
// detalhes (o antigo useMutation morria com o componente). O post otimista
// entra no feed na hora; este módulo resolve o job em background e substitui
// o post local pelo real quando termina — ou mantém o post local com um
// estado de erro se falhar, para o usuário decidir tentar de novo ou descartar.

export interface PublishJobState {
  status: 'uploading' | 'error';
  progress: number;
  error?: string;
}

interface PublishJob extends PublishJobState {
  input: CreatePostInput;
  profile: MyProfile;
}

const jobs = new Map<string, PublishJob>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function revokePreviewUrls(input: CreatePostInput): void {
  input.media.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
}

async function runJob(localId: string): Promise<void> {
  const job = jobs.get(localId);
  if (!job) return;
  job.status = 'uploading';
  job.progress = 0;
  job.error = undefined;
  notify();

  try {
    await runCreatePost(job.input, (fraction) => {
      const current = jobs.get(localId);
      if (!current) return;
      current.progress = fraction;
      notify();
    });
    // Sucesso: o post local cumpriu seu papel visual — some do cache e o
    // refetch de ['feed'] (abaixo) traz o post real na posição que o servidor
    // decidir (pode não ser o topo, e está tudo bem).
    removeOptimisticPost(queryClient, localId);
    revokePreviewUrls(job.input);
    jobs.delete(localId);
    notify();
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  } catch (error) {
    const current = jobs.get(localId);
    if (!current) return;
    current.status = 'error';
    current.error = getCreatePostErrorMessage(error);
    notify();
  }
}

// Publica em background: insere o post otimista no feed do próprio autor
// imediatamente e retorna sem esperar o upload — quem chamou já pode navegar.
export function enqueuePublish(input: CreatePostInput, profile: MyProfile): string {
  const localId = `local-${crypto.randomUUID()}`;
  insertOptimisticPost(queryClient, buildOptimisticPost(input, profile, localId));
  jobs.set(localId, { status: 'uploading', progress: 0, input, profile });
  notify();
  void runJob(localId);
  return localId;
}

// Tenta de novo um job que falhou, reaproveitando o input original guardado.
export function retryPublish(localId: string): void {
  if (jobs.has(localId)) void runJob(localId);
}

// Descarta um post que falhou: some do feed e revoga os previews locais.
export function dismissPublishError(localId: string): void {
  const job = jobs.get(localId);
  if (!job) return;
  removeOptimisticPost(queryClient, localId);
  revokePreviewUrls(job.input);
  jobs.delete(localId);
  notify();
}

export function isLocalPostId(id: string): boolean {
  return id.startsWith('local-');
}

export function usePublishJob(postId: string): PublishJobState | undefined {
  return useSyncExternalStore(subscribe, () => {
    const job = jobs.get(postId);
    return job ? { status: job.status, progress: job.progress, error: job.error } : undefined;
  });
}
