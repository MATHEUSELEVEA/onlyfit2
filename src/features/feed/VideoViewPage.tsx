import { useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useCreatorFeedPosts, useFeedPost } from './useFeed';
import { PostCard } from './PostCard';
import { BackButton } from '@/components/ui/BackButton';

// Visualização de um único vídeo (aberto a partir do Explorar ou do perfil de
// um criador): mesmo visual do feed, mas sem a barra de esportes e sem
// rolagem para outros posts — só a setinha para voltar de onde o usuário veio.
export function VideoViewPage() {
  const { postId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const profileUsername = searchParams.get('profile');
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const singlePostQuery = useFeedPost(profileUsername ? null : postId);
  const profilePostsQuery = useCreatorFeedPosts(profileUsername);

  const posts = useMemo(() => {
    if (profileUsername) return profilePostsQuery.data ?? [];
    return singlePostQuery.data ? [singlePostQuery.data] : [];
  }, [profilePostsQuery.data, profileUsername, singlePostQuery.data]);

  const isLoading = profileUsername ? profilePostsQuery.isLoading : singlePostQuery.isLoading;
  const currentExists = posts.some((post) => post.id === postId);

  useEffect(() => {
    if (!posts.length) return;
    const target = itemRefs.current.get(postId);
    target?.scrollIntoView({ block: 'start' });
  }, [postId, posts.length]);

  return (
    <div className="relative h-full overflow-hidden bg-surface-container-lowest">
      <div className="absolute left-4 top-[max(0.75rem,env(safe-area-inset-top))] z-30">
        <BackButton fallback="/feed" overMedia />
      </div>

      {isLoading && (
        <div className="flex h-full items-center justify-center">
          <Loader2 size={28} className="animate-spin text-on-surface-variant" aria-label="Carregando" />
        </div>
      )}

      {!isLoading && (!posts.length || !currentExists) && (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="font-sans text-title text-on-surface">Vídeo não encontrado</p>
        </div>
      )}

      {posts.length > 0 && currentExists && (
        <div className="h-full snap-y snap-mandatory overflow-y-auto">
          {posts.map((post) => (
            <div
              key={post.id}
              ref={(node) => {
                if (node) itemRefs.current.set(post.id, node);
                else itemRefs.current.delete(post.id);
              }}
              className="h-full snap-start"
            >
              <PostCard post={post} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
