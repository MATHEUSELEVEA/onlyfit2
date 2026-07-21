import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { StoryProgressRing } from './StoryProgressRing';
import type { StoryItem, StoryMediaKind } from './types';

interface CreatorHeader {
  username: string;
  avatarUrl: string | null;
}

interface StoryRow {
  id: string;
  creator_id: string;
  media_type: StoryMediaKind;
  media_url: string;
  duration_seconds: number;
}

// Busca única, ao montar — nunca refeita durante a sessão. É essa
// imutabilidade que garante a regra pedida: se as 24h de um story expirarem
// enquanto o usuário já está vendo a fila, o item já está neste array local
// e continua sendo exibido até o fim. Expiração só decide se uma NOVA sessão
// (reabrir o viewer) consegue começar a ver — nunca corta uma em andamento.
function useStorySession(creatorId: string | undefined) {
  const [items, setItems] = useState<StoryItem[] | null>(null);

  useEffect(() => {
    if (!creatorId) return;
    let active = true;

    // setState roda dentro de .then() (depois de um gap assíncrono), nunca
    // sincronamente no corpo do efeito — mesmo padrão de AuthContext.tsx.
    Promise.resolve()
      .then(() => {
        if (active) setItems(null);
        return supabase
          .from('stories')
          .select('id, creator_id, media_type, media_url, duration_seconds')
          .eq('creator_id', creatorId)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: true });
      })
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setItems([]);
          return;
        }
        setItems(
          (data as StoryRow[]).map((row) => ({
            id: row.id,
            creatorId: row.creator_id,
            mediaType: row.media_type,
            mediaUrl: row.media_url,
            durationSeconds: Number(row.duration_seconds),
          })),
        );
      });

    return () => {
      active = false;
    };
  }, [creatorId]);

  return items;
}

function useCreatorHeader(creatorId: string | undefined) {
  const [header, setHeader] = useState<CreatorHeader | null>(null);

  useEffect(() => {
    if (!creatorId) return;
    let active = true;
    supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', creatorId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        setHeader({ username: data.username ?? 'creator', avatarUrl: data.avatar_url });
      });
    return () => {
      active = false;
    };
  }, [creatorId]);

  return header;
}

// Viewer full-screen de stories: tap na metade esquerda volta, na direita
// avança; ao acabar a fila deste creator, fecha o viewer (voltar para a
// barra do feed e escolher outro creator é a navegação esperada, como
// Instagram). O indicador circular ao redor do avatar é o "relogiozinho"
// pedido — não a barra linear do Instagram.
export function StoryViewerPage() {
  const { creatorId } = useParams<{ creatorId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const items = useStorySession(creatorId);
  const header = useCreatorHeader(creatorId);

  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const viewedRef = useRef<Set<string>>(new Set());

  const current = items && items.length > 0 ? items[index] ?? null : null;

  const close = useCallback(() => navigate(-1), [navigate]);

  // Fila vazia (nenhum story ativo/visível deste creator) — fecha sozinho.
  useEffect(() => {
    if (items && items.length === 0) close();
  }, [items, close]);

  const goNext = useCallback(() => {
    setIndex((prev) => {
      if (!items) return prev;
      if (prev + 1 < items.length) return prev + 1;
      close();
      return prev;
    });
  }, [items, close]);

  const goPrev = useCallback(() => {
    setIndex((prev) => Math.max(0, prev - 1));
  }, []);

  // Marca a view no INÍCIO da exibição de cada item (não no fim) — uma saída
  // no meio ainda conta como "visto", igual Instagram.
  useEffect(() => {
    if (!current || !session?.user.id) return;
    if (viewedRef.current.has(current.id)) return;
    viewedRef.current.add(current.id);
    void supabase.rpc('mark_story_viewed', { p_story_id: current.id });
  }, [current, session?.user.id]);

  // Progresso do item atual — vídeo lê currentTime/duration via
  // requestAnimationFrame (mais suave que o evento timeupdate, que dispara só
  // ~4x/s); foto usa um cronômetro linear ao longo de duration_seconds.
  useEffect(() => {
    if (!current) return;
    let cancelled = false;

    // Mesmo padrão do efeito acima: setState só depois de um gap assíncrono,
    // nunca sincronamente no corpo do efeito.
    Promise.resolve().then(() => {
      if (cancelled) return;
      setProgress(0);

      if (current.mediaType === 'video') {
        const tick = () => {
          if (cancelled) return;
          const video = videoRef.current;
          const duration = video?.duration || current.durationSeconds;
          if (video && duration > 0) setProgress(Math.min(1, video.currentTime / duration));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } else {
        const startedAt = performance.now();
        const durationMs = current.durationSeconds * 1000;
        const tick = () => {
          if (cancelled) return;
          const fraction = Math.min(1, (performance.now() - startedAt) / durationMs);
          setProgress(fraction);
          if (fraction >= 1) {
            goNext();
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }
    });

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [current, goNext]);

  const handleTap = (event: MouseEvent<HTMLDivElement>) => {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    const tapX = event.clientX - left;
    if (tapX < width * 0.3) goPrev();
    else goNext();
  };

  if (!items || items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <Loader2 size={28} className="animate-spin text-white/70" aria-label="Carregando stories" />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-black">
      <div className="relative min-h-0 flex-1 overflow-hidden" onClick={handleTap}>
        {current?.mediaType === 'video' ? (
          <video
            key={current.id}
            ref={videoRef}
            src={current.mediaUrl}
            autoPlay
            playsInline
            className="h-full w-full object-contain"
            onEnded={goNext}
          />
        ) : current ? (
          <img key={current.id} src={current.mediaUrl} alt="" className="h-full w-full object-contain" />
        ) : null}

        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-4 pb-3 pt-safe-top">
          <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center">
            <StoryProgressRing progress={progress} size={52} />
            <span className="absolute flex h-10 w-10 items-center justify-center overflow-hidden rounded-full">
              {header?.avatarUrl ? (
                <img src={header.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-surface-container-high font-sans text-label text-on-surface">
                  {(header?.username ?? '?').slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-sans text-handle text-white drop-shadow">
              @{header?.username ?? '…'}
            </span>
            {items.length > 1 && (
              <span className="font-sans text-counter text-white/70">
                {index + 1}/{items.length}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              close();
            }}
            aria-label="Fechar stories"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
