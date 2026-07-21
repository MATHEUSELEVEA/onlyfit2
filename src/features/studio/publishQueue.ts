import { useSyncExternalStore } from 'react';
import { queryClient } from '@/lib/queryClient';
import type { MyProfile } from '@/features/profile/useMyProfile';
import type { FeedPost } from '@/features/feed/types';
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
  post: FeedPost;
  snapshot: PublishJobState;
}

const jobs = new Map<string, PublishJob>();
const listeners = new Set<() => void>();
let jobsSnapshot: PublishJobSnapshot[] = [];

export interface PublishJobSnapshot extends PublishJobState {
  id: string;
  post: FeedPost;
}

function refreshSnapshot(): void {
  jobsSnapshot = Array.from(jobs, ([id, job]) => ({
    id,
    post: job.post,
    ...job.snapshot,
  }));
}

function notify(): void {
  refreshSnapshot();
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
  job.snapshot = { status: 'uploading', progress: 0 };
  notify();

  try {
    await runCreatePost(job.input, (fraction) => {
      const current = jobs.get(localId);
      if (!current) return;
      current.progress = fraction;
      current.snapshot = { status: 'uploading', progress: fraction };
      notify();
    });
    // Sucesso: o post local sai da fila e o refetch de ['feed'] (abaixo) traz
    // o post real na posição que o servidor decidir.
    revokePreviewUrls(job.input);
    jobs.delete(localId);
    notify();
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  } catch (error) {
    const current = jobs.get(localId);
    if (!current) return;
    current.status = 'error';
    current.error = getCreatePostErrorMessage(error);
    current.snapshot = {
      status: 'error',
      progress: current.progress,
      error: current.error,
    };
    notify();
  }
}

// Publica em background: registra o post otimista na fila imediatamente e
// retorna sem esperar o upload — o FeedPage o renderiza mesmo sem cache prévio.
export function enqueuePublish(input: CreatePostInput, profile: MyProfile): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const localId = `local-${randomId}`;
  const post = buildOptimisticPost(input, profile, localId);
  jobs.set(localId, {
    status: 'uploading',
    progress: 0,
    input,
    profile,
    post,
    snapshot: { status: 'uploading', progress: 0 },
  });
  notify();
  void runJob(localId);
  return localId;
}

// Tenta de novo um job que falhou, reaproveitando o input original guardado.
export function retryPublish(localId: string): void {
  if (jobs.has(localId)) void runJob(localId);
}

// Descarta um post que falhou: remove-o da fila e revoga os previews locais.
export function dismissPublishError(localId: string): void {
  const job = jobs.get(localId);
  if (!job) return;
  revokePreviewUrls(job.input);
  jobs.delete(localId);
  notify();
}

export function isLocalPostId(id: string): boolean {
  return id.startsWith('local-');
}

export function usePublishJob(postId: string): PublishJobState | undefined {
  return useSyncExternalStore(
    subscribe,
    () => jobs.get(postId)?.snapshot,
    () => jobs.get(postId)?.snapshot,
  );
}

export function usePublishJobs(): PublishJobSnapshot[] {
  return useSyncExternalStore(subscribe, () => jobsSnapshot, () => jobsSnapshot);
}
