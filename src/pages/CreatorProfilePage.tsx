import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { supabase } from '@/lib/supabase';
import type { FeedAuthor } from '@/features/feed/types';

interface CreatorProfile {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  verified: boolean;
}

async function fetchCreator(username: string): Promise<CreatorProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, full_name, avatar_url, is_creator')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    username: data.username ?? username,
    displayName: data.full_name ?? null,
    avatarUrl: data.avatar_url ?? null,
    verified: Boolean(data.is_creator),
  };
}

export function CreatorProfilePage() {
  const { username = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Dados vindos do feed (Link state) para render imediato, sem esperar a rede.
  const seed = (location.state as { author?: FeedAuthor } | null)?.author;

  const [following, setFollowing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const { data } = useQuery({
    queryKey: ['creator', username],
    queryFn: () => fetchCreator(username),
    enabled: Boolean(username),
  });

  const creator: CreatorProfile = data ?? {
    username,
    displayName: seed?.displayName ?? null,
    avatarUrl: seed?.avatarUrl ?? null,
    verified: seed?.verified ?? false,
  };

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-background/90 px-4 pb-2 pt-safe-top backdrop-blur-md">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="mt-2 flex h-11 w-11 items-center justify-center rounded-full text-on-surface active:bg-surface-container"
        >
          <ArrowLeft size={24} aria-hidden />
        </button>
        <span className="mt-2 truncate font-sans text-title text-on-surface">
          @{creator.username}
        </span>
      </header>

      <div className="flex flex-col items-center px-5 pt-4 text-center">
        {creator.avatarUrl ? (
          <img
            src={creator.avatarUrl}
            alt={`Avatar de @${creator.username}`}
            className="h-24 w-24 rounded-full border-2 border-primary object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-primary bg-surface-container-high font-sans text-title-lg text-on-surface">
            {creator.username.slice(0, 1).toUpperCase()}
          </div>
        )}

        {creator.displayName && (
          <h1 className="mt-3 font-sans text-title-lg text-on-surface">{creator.displayName}</h1>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-on-surface-variant">
          <span className="font-sans text-body">@{creator.username}</span>
          {creator.verified && (
            <BadgeCheck size={16} className="text-primary" aria-label="Verificado" />
          )}
        </div>

        <div className="mt-5 flex w-full max-w-xs gap-2">
          <button
            type="button"
            onClick={() => setSubscribed((v) => !v)}
            aria-pressed={subscribed}
            className={clsx(
              'min-h-[44px] flex-1 rounded-lg font-sans text-label transition-colors',
              subscribed
                ? 'border border-outline-variant/60 text-on-surface'
                : 'bg-primary text-on-primary',
            )}
          >
            {subscribed ? 'Assinado' : 'Assinar'}
          </button>
          <button
            type="button"
            onClick={() => setFollowing((v) => !v)}
            aria-pressed={following}
            className={clsx(
              'min-h-[44px] flex-1 rounded-lg font-sans text-label transition-colors',
              following
                ? 'bg-surface-container text-on-surface'
                : 'border border-outline-variant/60 text-on-surface',
            )}
          >
            {following ? 'Seguindo' : 'Seguir'}
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-2 px-6 text-center">
        <p className="font-sans text-body text-on-surface-variant">
          Conteúdos deste creator em breve.
        </p>
      </div>
    </div>
  );
}
