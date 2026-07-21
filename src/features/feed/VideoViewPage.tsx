import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useFeedPost } from './useFeed';
import { PostCard } from './PostCard';
import { BackButton } from '@/components/ui/BackButton';

// Visualização de um único vídeo (aberto a partir do Explorar ou do perfil de
// um criador): mesmo visual do feed, mas sem a barra de esportes e sem
// rolagem para outros posts — só a setinha para voltar de onde o usuário veio.
export function VideoViewPage() {
  const { postId = '' } = useParams();
  const { data: post, isLoading } = useFeedPost(postId);

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

      {!isLoading && !post && (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="font-sans text-title text-on-surface">Vídeo não encontrado</p>
        </div>
      )}

      {post && <PostCard post={post} />}
    </div>
  );
}
