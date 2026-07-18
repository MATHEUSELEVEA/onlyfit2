import { useCallback, useEffect, useMemo, useState } from 'react';
import { CirclePlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAvailableFeedSports, useFeed } from './useFeed';
import { PostCard } from './PostCard';
import { FeedSportsBar } from './FeedSportsBar';

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
  const navigate = useNavigate();
  const [sportSelection, setSportSelection] = useState<string[]>([]);
  const { data: availableSports = [] } = useAvailableFeedSports();
  const sports = useMemo(
    () => sportSelection.filter((sport) => availableSports.includes(sport)),
    [sportSelection, availableSports],
  );
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFeed(sports);

  const posts = useMemo(() => data?.pages.flatMap((page) => page.posts) ?? [], [data]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Uma página pode vir vazia depois do RLS (posts pagos de quem o usuário
  // segue). Sem nada na tela não há rolagem para pedir a próxima, então puxa.
  useEffect(() => {
    if (!isLoading && posts.length === 0 && hasNextPage) loadMore();
  }, [isLoading, posts.length, hasNextPage, loadMore]);

  // Busca a próxima página com dois posts de antecedência, para a rolagem não
  // esbarrar no fim da lista.
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight * 2) loadMore();
  };

  return (
    <div className="feed-viewport relative">
      {/* Feed vertical com snap por post */}
      <div
        onScroll={handleScroll}
        className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto bg-surface-container-lowest"
      >
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

        {!isLoading && !isError && !hasNextPage && posts.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-sans text-title text-on-surface">Nada por aqui ainda</p>
            <p className="text-body-sm text-on-surface-variant">
              Siga creators na aba Explorar para ver conteúdos no seu feed.
            </p>
          </div>
        )}

        {posts.map((post) => (
          <div key={post.id} className="h-full snap-start snap-always">
            <PostCard post={post} />
          </div>
        ))}
      </div>

      {/* Filtros acompanham os controles flutuantes da mídia, abaixo do som. */}
      <FeedSportsBar
        selected={sports}
        availableSports={availableSports}
        onSelect={setSportSelection}
      />

      <button
        type="button"
        onClick={() => navigate('/studio')}
        aria-label="Criar post"
        className="feed-create-button absolute right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary ring-4 ring-primary/15 transition-transform active:scale-95"
      >
        <CirclePlus size={26} aria-hidden />
      </button>
    </div>
  );
}
