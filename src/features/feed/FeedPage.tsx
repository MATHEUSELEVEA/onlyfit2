import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFeed } from './useFeed';
import { PostCard } from './PostCard';
import { FeedSportsBar } from './FeedSportsBar';
import { useActiveStoryItems } from '@/features/stories/useActiveStoryItems';
import { mergeFeedEntries } from '@/features/stories/feedMerge';
import { StoryCard } from '@/features/stories/StoryCard';
import { useAuth } from '@/contexts/AuthContext';
import { usePublishJobs } from '@/features/studio/publishQueue';

// Arrasto (px) além do qual soltar dispara o refresh.
const PULL_THRESHOLD = 56;
// O dedo anda mais que o indicador, como nos pull-to-refresh nativos.
const PULL_DRAG_FACTOR = 0.4;
const PULL_MAX = 88;

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
  const { session } = useAuth();
  // O filtro guarda as chaves dos grupos escolhidos. Um grupo sem conteúdo é
  // aplicado do mesmo jeito — o feed fica vazio e mostra o estado próprio, em
  // vez de ignorar a escolha do usuário.
  const [sports, setSports] = useState<string[]>([]);
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeed(sports);

  const posts = useMemo(() => data?.pages.flatMap((page) => page.posts) ?? [], [data]);
  const publishJobs = usePublishJobs();
  const visiblePosts = useMemo(() => {
    const serverPostIds = new Set(posts.map((post) => post.id));
    const pendingPosts = publishJobs
      .filter((job) => job.post.author.id === session?.user.id && !serverPostIds.has(job.post.id))
      .map((job) => job.post);
    return [...pendingPosts, ...posts];
  }, [posts, publishJobs, session?.user.id]);

  // Story não tem tela própria: entra misturado no mesmo scroll dos posts, na
  // mesma ordenação por data — a única diferença visual é o card ter o
  // relógio de tempo restante em vez do trilho de ações (ver StoryCard).
  const { data: storyItems } = useActiveStoryItems();
  const entries = useMemo(() => mergeFeedEntries(visiblePosts, storyItems ?? []), [visiblePosts, storyItems]);

  // Pull-to-refresh: distância atual do arrasto (0 = solto).
  const [pull, setPull] = useState(0);
  const pullStartY = useRef<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

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

  // Pull-to-refresh manual: o container tem snap obrigatório e overscroll
  // desligado, então o gesto nativo não existe — o arrasto no topo é medido
  // na mão e o feed desce junto com o dedo.
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    // Scrubber, botões e links possuem seus próprios gestos. Não deixe um
    // ajuste da duração do vídeo virar pull-to-refresh por acidente.
    if ((event.target as HTMLElement).closest('input, button, a')) return;
    const el = scrollerRef.current;
    if (el && el.scrollTop <= 0 && !isRefetching) {
      pullStartY.current = event.touches[0].clientY;
    }
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = pullStartY.current;
    const el = scrollerRef.current;
    if (start === null || !el) return;
    const delta = event.touches[0].clientY - start;
    if (delta <= 0 || el.scrollTop > 0) {
      pullStartY.current = null;
      setPull(0);
      return;
    }
    setPull(Math.min(delta * PULL_DRAG_FACTOR, PULL_MAX));
  };

  const handleTouchEnd = () => {
    if (pullStartY.current !== null && pull >= PULL_THRESHOLD) void refetch();
    pullStartY.current = null;
    setPull(0);
  };

  const pulling = pull > 0;

  return (
    <div className="relative h-full">
      {/* Indicador do pull-to-refresh, atrás do feed que desce junto do dedo */}
      {(pulling || isRefetching) && (
        <div
          className="pointer-events-none absolute inset-x-0 z-0 flex justify-center"
          style={{ top: 'calc(var(--feed-inset-t) + 16px)' }}
        >
          <Loader2
            size={26}
            className={isRefetching ? 'animate-spin text-white' : 'text-white/80'}
            style={
              isRefetching ? undefined : { transform: `rotate(${pull * 3}deg)`, opacity: pull / PULL_THRESHOLD }
            }
            aria-label={isRefetching ? 'Atualizando feed' : undefined}
            aria-hidden={!isRefetching}
          />
        </div>
      )}

      {/* Feed vertical com snap por post */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto bg-surface-container-lowest"
        style={{
          transform: pulling ? `translateY(${pull}px)` : undefined,
          transition: pulling ? undefined : 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {isLoading && visiblePosts.length === 0 && <FeedSkeleton />}

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

        {!isLoading && !isError && !hasNextPage && visiblePosts.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            {sports.length > 0 ? (
              <>
                <p className="font-sans text-title text-on-surface">Nada neste filtro ainda</p>
                <p className="text-body-sm text-on-surface-variant">
                  Ainda não há conteúdo para os grupos selecionados.
                </p>
                <button
                  type="button"
                  onClick={() => setSports([])}
                  className="mt-2 min-h-[44px] rounded-lg bg-primary px-6 font-sans text-label text-on-primary"
                >
                  Ver tudo
                </button>
              </>
            ) : (
              <>
                <p className="font-sans text-title text-on-surface">Nada por aqui ainda</p>
                <p className="text-body-sm text-on-surface-variant">
                  Siga creators na aba Explorar para ver conteúdos no seu feed.
                </p>
              </>
            )}
          </div>
        )}

        {entries.map((entry) => (
          <div key={entry.id} className="h-full snap-start snap-always">
            {/* Mantemos os itens já percorridos no DOM. A mídia inativa não
                faz preload nem toca, mas o usuário pode voltar a qualquer
                reel sem encontrar um palco vazio. */}
            {entry.kind === 'post' ? <PostCard post={entry.post} /> : <StoryCard story={entry.story} />}
          </div>
        ))}
      </div>

      {/* Cluster de controles do topo: som (no PostCard) → filtro → criar */}
      <FeedSportsBar selected={sports} onSelect={setSports} />

      <button
        type="button"
        onClick={() => navigate('/studio')}
        aria-label="Criar post"
        className="feed-ctrl-create absolute right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/25 text-white backdrop-blur-sm transition-transform active:scale-95"
      >
        <Plus size={22} aria-hidden />
      </button>
    </div>
  );
}
