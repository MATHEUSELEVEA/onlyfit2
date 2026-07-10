# API-GUIDELINES.md

Não temos uma API REST própria: a "API" do app é o **Supabase** (PostgREST, Auth, Storage e RPC) acessado pelo SDK. Estas são as regras de como consumir.

## Onde a chamada vive

- **Só dentro de um hook `useX`** em `src/features/<dominio>` (ou `src/lib` para algo transversal). Componente não chama Supabase direto.
- Client único: `import { supabase } from '@/lib/supabase'`.
- Leitura sempre via **React Query** (`useQuery`/`useInfiniteQuery`); escrita via `useMutation` com invalidação de cache. Ver `docs/MESSAGING-AND-CACHE.md`.

## Padrões de chamada

- **RPC para leitura composta / regra de visibilidade** (ex. `feed_home_posts_page`). Mantém a lógica no banco, sob RLS.
- **PostgREST (`.from(...).select(...)`) para leitura simples.** Selecione colunas explícitas, nunca `*` desnecessário.
- **Sempre paginado.** `range()`/`limit()` em toda lista. Sem teto = bug de escala.
- **Sempre cheque `error`:**

```ts
const { data, error } = await supabase.rpc('feed_home_posts_page', { p_limit, p_offset, p_sports });
if (error) throw error; // React Query transforma em estado de erro tratável na UI
```

- Nunca `try/catch` engolindo o erro em silêncio. Ou trata e mostra, ou propaga pro React Query.

## Tipagem

- Tipe a resposta na fronteira (ex. `features/feed/types.ts`). Nada de `any` no retorno de rede.
- O tipo do app reflete o que a query traz, não a tabela inteira — peça só o que usa.

## Nomes de RPC e parâmetros

- RPC em `snake_case`, verbo + escopo (`feed_home_posts_page`).
- Parâmetros prefixados como no padrão do banco (`p_limit`, `p_offset`, `p_sports`).
- Documente RPC nova em `docs/DATABASE.md`.

## Erros e resiliência

- Deixe o React Query cuidar de retry/backoff (padrão da lib); não reimplemente na mão.
- Erro de rede/permição vira mensagem clara ao usuário, não tela branca nem `console.error` mudo.
- Nunca exponha detalhe cru do Postgres na UI — mensagem amigável para o usuário, detalhe só em log de dev.

## Segurança

- Só a `anon key` no cliente. Autorização é RLS, não filtro no front. Ver `docs/SECURITY.md`.
- Não confie em dado do cliente para decidir acesso pago — o banco decide.
