import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { useActiveStories } from './useActiveStories';
import { usePublishStory } from './usePublishStory';
import { useMyProfile } from '@/features/profile/useMyProfile';
import { inferMediaKind } from '@/features/studio/media';

// Faixa horizontal de stories sobre o feed, no mesmo espírito do Instagram —
// mas aqui o FeedPage é um Reels vertical em tela cheia, então isso é um
// overlay absoluto (posicionado em index.css), não uma lista acima do feed.
//
// Publicar aqui ainda usa o picker de galeria simples (sem a câmera
// full-screen do Studio) — a captura de Stories pela câmera chega numa
// integração seguinte, quando o modo "Stories" do CameraModeSwitcher passar a
// chamar usePublishStory de verdade.
export function StoriesBar() {
  const navigate = useNavigate();
  const { data: creators } = useActiveStories();
  const { data: profile } = useMyProfile();
  const publishStory = usePublishStory();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const kind = inferMediaKind(file);
    if (!kind) return;
    publishStory.mutate({ file, kind, visibility: 'public' });
  };

  if (!profile) return null;

  return (
    <div className="feed-stories-bar absolute z-20 flex items-center gap-3 overflow-x-auto px-3 no-scrollbar">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={publishStory.isPending}
        aria-label="Adicionar ao seu story"
        className="flex shrink-0 flex-col items-center gap-1 disabled:opacity-60"
      >
        <span className="relative flex h-14 w-14 items-center justify-center">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-full w-full rounded-full border-2 border-white/40 object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center rounded-full border-2 border-white/40 bg-surface-container-high font-sans text-title text-on-surface">
              {(profile.username ?? '?').slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-black bg-primary text-on-primary">
            <Plus size={11} strokeWidth={3} aria-hidden />
          </span>
        </span>
      </button>

      {creators?.map((creator) => (
        <button
          key={creator.creatorId}
          type="button"
          onClick={() => navigate(`/stories/${creator.creatorId}`)}
          aria-label={`Ver stories de @${creator.username}`}
          className="flex shrink-0 flex-col items-center gap-1"
        >
          <span
            className={clsx(
              'flex h-14 w-14 items-center justify-center rounded-full p-0.5',
              creator.hasUnseen ? 'bg-primary' : 'bg-white/25',
            )}
          >
            {creator.avatarUrl ? (
              <img
                src={creator.avatarUrl}
                alt=""
                className="h-full w-full rounded-full border-2 border-black object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center rounded-full border-2 border-black bg-surface-container-high font-sans text-title text-on-surface">
                {creator.username.slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
