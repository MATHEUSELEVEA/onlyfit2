import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_CAPTION_STYLE, sanitizeCues, type CaptionCue, type CaptionTrack } from '@/lib/captions';
import type { FeedMedia, FeedPost } from './types';
import { sanitizeMediaFraming, type MediaFraming } from '@/features/mediaFraming';

const PAGE_SIZE = 10;

const POST_SELECT = `id, creator_id, title, description, is_premium, thumbnail_url, video_url,
   stream_status, stream_playback_url,
   likes, comments, published_at, metadata,
   profiles:creator_id!inner (
     username, full_name, avatar_url,
     creator_profiles (verified)
   )`;

// Linha crua retornada pelo select em `posts` (mesmo modelo do onlyfit v1).
interface PostRow {
  id: string;
  creator_id: string;
  title: string | null;
  description: string | null;
  is_premium: boolean;
  thumbnail_url: string | null;
  video_url: string | null;
  stream_status: string | null;
  stream_playback_url: string | null;
  likes: number | null;
  comments: number | null;
  published_at: string;
  metadata: Record<string, unknown> | null;
  profiles: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    creator_profiles:
      | { verified: boolean | null }
      | { verified: boolean | null }[]
      | null;
  } | null;
}

interface PostMediaRow {
  post_id: string;
  position: number;
  kind: 'image' | 'video';
  url: string;
  thumbnail_url: string | null;
  metadata: Record<string, unknown> | null;
}

// Páginas de carrossel por post (tabela post_media, migration 20260712180000).
// Post de mídia única não tem linha aqui — cai no fallback de `singleMedia`.
async function fetchPostMedia(postIds: string[]): Promise<Map<string, FeedMedia[]>> {
  const byPost = new Map<string, FeedMedia[]>();
  if (postIds.length === 0) return byPost;

  const { data, error } = await supabase
    .from('post_media')
    .select('post_id, position, kind, url, thumbnail_url, metadata')
    .in('post_id', postIds)
    .order('position', { ascending: true });
  if (error) throw error;

  for (const row of (data ?? []) as PostMediaRow[]) {
    const list = byPost.get(row.post_id) ?? [];
    list.push({ kind: row.kind, url: row.url, thumbnailUrl: row.thumbnail_url, framing: sanitizeMediaFraming(row.metadata?.framing) });
    byPost.set(row.post_id, list);
  }
  return byPost;
}

// Fallback para posts de mídia única (v1 e legados): monta uma página a partir
// de video_url/thumbnail_url. Vídeo tem video_url; imagem única mora só no
// thumbnail_url (video_url null), como o Studio do v1 grava.
function singleMedia(row: PostRow): FeedMedia[] {
  if (row.video_url) {
    const hlsUrl = row.stream_status === 'ready' ? row.stream_playback_url : null;
    return [{ kind: 'video', url: row.video_url, thumbnailUrl: row.thumbnail_url, hlsUrl, captions: readCaptions(row.metadata), framing: readMediaFraming(row.metadata, 0) }];
  }
  if (row.thumbnail_url) {
    return [{ kind: 'image', url: row.thumbnail_url, thumbnailUrl: null, framing: readMediaFraming(row.metadata, 0) }];
  }
  return [];
}

function isVerifiedCreator(profile: PostRow['profiles']): boolean {
  const creatorProfile = Array.isArray(profile?.creator_profiles)
    ? profile.creator_profiles[0]
    : profile?.creator_profiles;
  return creatorProfile?.verified === true;
}

function toFeedPost(
  row: PostRow,
  likedPostIds: Set<string>,
  mediaByPost: Map<string, FeedMedia[]>,
): FeedPost {
  const carousel = mediaByPost.get(row.id);
  return {
    id: row.id,
    author: {
      id: row.creator_id,
      username: row.profiles?.username ?? 'creator',
      displayName: row.profiles?.full_name ?? null,
      avatarUrl: row.profiles?.avatar_url ?? null,
      verified: isVerifiedCreator(row.profiles),
    },
    caption: row.description ?? row.title ?? '',
    media: carousel && carousel.length > 0 ? carousel : singleMedia(row),
    likeCount: row.likes ?? 0,
    commentCount: row.comments ?? 0,
    createdAt: row.published_at,
    product: null, // banner de produto entra na próxima etapa
    location: readLocationName(row.metadata),
    likedByMe: likedPostIds.has(row.id),
    commentsDisabled: row.metadata?.comments_disabled === true,
  };
}

// Legenda autoral guardada em metadata.captions ({ cues, style }). Parse
// defensivo: só devolve uma track válida com pelo menos uma fala.
function readCaptions(metadata: PostRow['metadata']): CaptionTrack | null {
  const raw = metadata?.captions as { cues?: unknown; style?: unknown } | undefined;
  if (!raw || !Array.isArray(raw.cues)) return null;
  const cues: CaptionCue[] = raw.cues
    .filter((c): c is CaptionCue => {
      const cue = c as Record<string, unknown>;
      return typeof cue?.start === 'number' && typeof cue?.end === 'number' && typeof cue?.text === 'string' && cue.text.trim().length > 0;
    })
    .map((c) => ({ start: c.start, end: c.end, text: c.text }));
  const sane = sanitizeCues(cues);
  if (sane.length === 0) return null;
  const style = { ...DEFAULT_CAPTION_STYLE, ...(raw.style as object) } as CaptionTrack['style'];
  return { cues: sane, style };
}

// Nome legível da localização guardada em metadata.location ({name, secondary}).
function readLocationName(metadata: PostRow['metadata']): string | null {
  const loc = metadata?.location as { name?: unknown } | undefined;
  return loc && typeof loc.name === 'string' && loc.name.trim() ? loc.name.trim() : null;
}

function readMediaFraming(metadata: PostRow['metadata'], position: number): MediaFraming | null {
  const raw = metadata?.media_framing;
  if (Array.isArray(raw)) return sanitizeMediaFraming(raw[position]);
  return sanitizeMediaFraming(raw);
}

async function fetchLikedPostIds(userId: string, postIds: string[]): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);
  if (error) throw error;
  return new Set(((data ?? []) as { post_id: string }[]).map((row) => row.post_id));
}

interface FeedPage {
  posts: FeedPost[];
  /** Ids que a RPC devolveu — pode ser maior que posts.length (ver abaixo). */
  idCount: number;
}

async function fetchFeedPage(userId: string, sports: string[], offset: number): Promise<FeedPage> {
  // Mesma RPC do onlyfit v1: retorna os ids na ordem correta do feed "home".
  // p_sports null = sem filtro ("Tudo"); array = filtra por grupo de afinidade.
  const { data: idRows, error: rpcError } = await supabase.rpc('feed_home_posts_page', {
    p_limit: PAGE_SIZE,
    p_offset: offset,
    p_sports: sports.length ? sports : null,
  });
  if (rpcError) throw rpcError;

  const ids = ((idRows ?? []) as { post_id: string }[]).map((r) => r.post_id).filter(Boolean);
  if (ids.length === 0) return { posts: [], idCount: 0 };

  // A RPC é SECURITY DEFINER e enxerga tudo; este select passa pelo RLS. Post
  // pago de um creator que o usuário segue vem na lista de ids mas não pode ser
  // lido, então a página rende menos posts do que os ids pedidos — por isso o
  // offset da próxima página anda por idCount, e não por posts.length.
  const { data, error } = await supabase.from('posts').select(POST_SELECT).in('id', ids);
  if (error) throw error;

  const byId = new Map((data as unknown as PostRow[]).map((row) => [row.id, row]));
  const rows = ids
    .map((id) => byId.get(id))
    .filter((row): row is PostRow => Boolean(row));

  const rowIds = rows.map((row) => row.id);
  const [likedPostIds, mediaByPost] = await Promise.all([
    fetchLikedPostIds(userId, rowIds),
    fetchPostMedia(rowIds),
  ]);

  return { posts: rows.map((row) => toFeedPost(row, likedPostIds, mediaByPost)), idCount: ids.length };
}

async function fetchFeedPostById(userId: string, postId: string): Promise<FeedPost | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as PostRow;
  const [likedPostIds, mediaByPost] = await Promise.all([
    fetchLikedPostIds(userId, [row.id]),
    fetchPostMedia([row.id]),
  ]);
  return toFeedPost(row, likedPostIds, mediaByPost);
}

// Feed paginado: o usuário rola até o fim do que segue, não só a primeira
// página. Sem isto o feed parava nos 10 primeiros posts e creators com posts
// mais antigos nunca apareciam.
export function useFeed(sports: string[]) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useInfiniteQuery({
    queryKey: ['feed', userId, sports],
    queryFn: ({ pageParam }) => fetchFeedPage(userId!, sports, pageParam),
    initialPageParam: 0,
    // Página com menos ids que o pedido = acabou o feed.
    getNextPageParam: (lastPage, _pages, lastOffset) =>
      lastPage.idCount < PAGE_SIZE ? undefined : lastOffset + lastPage.idCount,
    enabled: Boolean(userId),
    // Mantém o feed atual na tela enquanto o novo grupo carrega — sem isso o
    // data volta a undefined a cada troca de filtro e o skeleton pisca.
    placeholderData: keepPreviousData,
  });
}

// Um post aparece em dois caches: as páginas do feed e a tela de vídeo único.
// Quem mexe num post (curtir, comentar) tem que atualizar os dois.
const POST_CACHE_KEYS = [['feed'], ['feed-post']];

export type PostCacheSnapshot = [QueryKey, unknown][];

export async function cancelPostCaches(queryClient: QueryClient) {
  await Promise.all(POST_CACHE_KEYS.map((queryKey) => queryClient.cancelQueries({ queryKey })));
}

/** Snapshot dos caches de post, para rollback de update otimista. */
export function snapshotPostCaches(queryClient: QueryClient): PostCacheSnapshot {
  return POST_CACHE_KEYS.flatMap((queryKey) => queryClient.getQueriesData({ queryKey }));
}

export function restorePostCaches(queryClient: QueryClient, snapshot: PostCacheSnapshot) {
  snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
}

// O feed é paginado, então o cache é { pages: [{ posts }] } e não uma lista
// chapada de posts: quem mexe num post tem que descer até page.posts.
export function updatePostCaches(
  queryClient: QueryClient,
  postId: string,
  update: (post: FeedPost) => FeedPost,
) {
  queryClient.setQueriesData<InfiniteData<FeedPage>>({ queryKey: ['feed'] }, (cache) =>
    cache
      ? {
          ...cache,
          pages: cache.pages.map((page) => ({
            ...page,
            posts: page.posts.map((post) => (post.id === postId ? update(post) : post)),
          })),
        }
      : cache,
  );

  queryClient.setQueriesData<FeedPost | null>({ queryKey: ['feed-post'] }, (post) =>
    post && post.id === postId ? update(post) : post,
  );
}

// Post específico aberto a partir do Explorar — entra fixado no topo do
// feed para o usuário assistir sem sair para o perfil do creator.
export function useFeedPost(postId: string | null) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['feed-post', userId, postId],
    queryFn: () => fetchFeedPostById(userId!, postId!),
    enabled: Boolean(userId && postId),
  });
}
