# MESSAGING-AND-CACHE.md

Como o app lida com estado de servidor, cache e "mensageria" no cliente. Ferramenta única: **TanStack Query (React Query)**. Não há fila/broker no front — mensageria de verdade (webhooks de pagamento etc.) é do ecossistema (ver `docs/ECOSYSTEM.md`).

## Regra central

**Todo dado que vem do Supabase é "estado de servidor" e mora no React Query — nunca em `useState`.** `useState` é só para estado de UI local (aberto/fechado, texto de input). Isso elimina `useEffect` de fetch, cache manual e bugs de sincronização.

## Query keys

- Chave é um array estável e descritivo: `['feed', { sports }]`, `['post', postId]`, `['profile', userId]`.
- Mesma chave = mesmo cache. Parâmetro que muda o resultado **entra na chave**.
- Centralize a construção de chaves por feature se começarem a se repetir.

## Leitura

- Lista paginada/infinita → `useInfiniteQuery` (feed usa isso, casando com `feed_home_posts_page(p_limit, p_offset, …)`).
- Item único → `useQuery`.
- Configure `staleTime` conforme o dado: feed pode ficar "fresco" alguns segundos; perfil, mais. Não deixe tudo em `0` (refetch à toa) nem `Infinity` (dado velho).

## Escrita (mutations)

- `useMutation` para curtir, seguir, assinar etc.
- Ao concluir, **invalide as queries afetadas** (`queryClient.invalidateQueries`) em vez de remontar o estado na mão.
- Para ações de feedback imediato (curtir), use **optimistic update** com rollback no erro — mas só onde a latência atrapalha a UX. Não complique onde não precisa.

## Cache e invalidação

- Prefira **invalidar** (marca como stale, refetch) a escrever no cache manualmente. Menos chance de dessincronizar.
- Não guarde o mesmo dado em dois lugares (React Query + Context). Uma fonte por dado.

## O que NÃO fazer

- `useEffect(() => { fetch... }, [])` → proibido. Vira hook de query.
- Cache caseiro em `useRef`/módulo global → proibido. React Query já é o cache.
- Guardar resposta de servidor em `localStorage` na mão (fora a sessão do Supabase e o tema).

## Realtime

- Se um dia usarmos Supabase Realtime, a subscription vive num `useEffect` dedicado que **invalida** a query correspondente na chegada do evento — não reescreve o cache diretamente. Avalie custo antes de adotar em telas de alto volume.
