import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAvailableFeedSports, useFeed, useFeedPost } from './useFeed';
import { PostCard } from './PostCard';
import { FeedSportsBar } from './FeedSportsBar';
import type { FeedPost } from './types';

function FeedSkeleton() {
  return (
    <div className="flex h-full snap-start flex-col justify-end gap-4 bg-surface-container-low p-4 pb-8">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 animate-pulse rounded-full bg-surface-container-high" />
        <div className="h-4 w-40 animate-pulse rounded bg-surface-container-high" />
      </div>
      <div className="h-3 w-3/4 animate-pulse rounded bg-surface-container-high" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-surface-container-high" />
    </div>
  );
}

export function FeedPage() {
  const [sportSelection, setSportSelection] = useState<string | null>(null);
  const { data: availableSports = [] } = useAvailableFeedSports();
  const selectedSport =
    sportSelection && availableSports.includes(sportSelection) ? sportSelection : null;
  const sports = useMemo(() => (selectedSport ? [selectedSport] : []), [selectedSport]);
  const { data: posts, isLoading, isError, refetch } = useFeed(sports);

  // Post aberto a partir do Explorar (?post=<id>): entra fixado no topo do
  // feed para tocar de cara, em vez de mandar o usuário pro perfil do creator.
  const [searchParams] = useSearchParams();
  const openPostId = searchParams.get('post');
  const { data: openPost } = useFeedPost(openPostId);

  const feedPosts = useMemo<FeedPost[] | undefined>(() => {
    if (!openPost) return posts;
    const rest = (posts ?? []).filter((post) => post.id !== openPost.id);
    return [openPost, ...rest];
  }, [posts, openPost]);

  return (
    <div className="relative h-full">
      {/* Topo: barra de grupos de afinidade (rolagem lateral, estilo TikTok) */}
      <header className="absolute left-0 top-0 z-20 w-full pb-2 pt-safe-top">
        <div className="mt-2">
          <FeedSportsBar
            selected={selectedSport}
            availableSports={availableSports}
            onSelect={setSportSelection}
          />
        </div>
      </header>

      {/* Feed vertical com snap por post */}
      <div className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto">
        {isLoading && <FeedSkeleton />}

        {isError && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-body text-on-surface-variant">
              Não foi possível carregar o feed.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="min-h-[44px] rounded-lg bg-primary px-6 font-sans text-label text-on-primary"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {feedPosts?.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-sans text-title text-on-surface">Nada por aqui ainda</p>
            <p className="text-body-sm text-on-surface-variant">
              Siga creators na aba Explorar para ver conteúdos no seu feed.
            </p>
          </div>
        )}

        {feedPosts?.map((post) => (
          <div key={post.id} className="h-full snap-start snap-always">
            <PostCard post={post} />
          </div>
        ))}
      </div>
    </div>
  );
}
