# DATABASE.md

O backend é o **Supabase de produção compartilhado com o OnlyFit v1** (mesmo projeto/banco). Isso é crítico: **este app lê e escreve dados reais de usuários reais.** Cuidado redobrado.

## Regras inegociáveis

1. **É produção.** Não rode migração destrutiva, `DELETE`/`UPDATE` em massa, nem "teste" contra este banco sem saber exatamente o efeito. Em dúvida, não execute.
2. **RLS sempre ligado.** Toda tabela tem Row Level Security ativo e policies explícitas. Sem policy, ninguém acessa — e é assim que deve ser. Ver `docs/SECURITY.md`.
3. **O schema é do v1.** Este app se adapta ao modelo existente; não redesenha tabela do v1 por conveniência do front. Mudança de schema é decisão de ecossistema (ver `docs/ECOSYSTEM.md` e `docs/DECISIONS.md`).
4. **Prefira RPC para leitura composta.** Ordenação de feed, agregações e regras de visibilidade ficam em funções SQL (`SECURITY DEFINER` quando necessário e auditado), não montadas no cliente.

## Acesso a partir do app

- Client único em `src/lib/supabase.ts`. Ninguém cria outro.
- Toda leitura via hook React Query (`useX`). Ver `docs/MESSAGING-AND-CACHE.md`.
- **Sempre pagine.** Nada de `select('*')` sem `limit`. Listas usam `limit/offset` (ou cursor).
- **Selecione colunas explícitas**, não `*`, quando prático — menos payload, menos vazamento acidental.
- Verifique `error` de toda chamada. Não engula.

## Objetos que o app usa hoje

Leitura:

- RPC `feed_home_posts_page(p_limit, p_offset, p_sports)` → ids ordenados do feed.
- RPC `feed_home_available_sports()` → grupos com ao menos um post elegível no feed do usuário.
- `posts` (+ join `profiles` via `creator_id`) → conteúdo do post; posts públicos de creators alimentam o Explorar.
- `post_media` → páginas do carrossel (imagem/vídeo por `position`) quando o post tem mais de uma mídia. Post de mídia única não tem linha aqui — o feed cai no fallback `posts.video_url`/`thumbnail_url`. Ver `docs/DECISIONS.md` #0009.
- `profiles` + `creator_profiles` → identidade, bio, esportes (`sports`, fonte única de modalidade/afinidade — ver `docs/DECISIONS.md` #0008; `category` existe no schema do v1 mas não é lida pelo app) e contadores de creators.
- `creator_memberships` + `subscriptions` (legada) → estado "Assinado" (**somente leitura** — ver abaixo).

Leitura + escrita (sempre a linha do próprio usuário, garantida por RLS):

- `post_likes` → curtir/descurtir (insert/delete).
- `post_comments` → comentar (select/insert).
- `creator_follows` → seguir/deixar de seguir (upsert com `status: 'active'`/delete).
- `posts` + `post_media` → o estúdio (`features/studio`) publica o post do próprio creator (RLS `"Creators can insert own posts"`); mídia sobe via edge function `create-r2-upload-url`. Carrossel grava as páginas em `post_media`. Ver `docs/DECISIONS.md` #0009 e #0010.

> Posts **salvos** ainda não têm tabela no banco: ficam em `localStorage` por usuário (`useSavedPost`). Quando a tabela existir, só o hook muda.

## Escritas que o cliente NUNCA faz

`subscriptions`, `creator_memberships` e qualquer tabela de pagamento/plano são **somente leitura** no front. Assinar passa por checkout/servidor (ver `docs/ECOSYSTEM.md`); inserir uma "assinatura" direto do cliente seria liberar conteúdo pago sem cobrança. O RLS bloqueia, e o código do app nem tenta.

> Mantenha esta lista curta e verdadeira: registre aqui só o que o app **realmente** consome. O schema completo é do v1.

## Ao precisar de um dado novo

1. Veja se já existe tabela/RPC no v1 que serve. Reuse antes de criar.
2. Se precisar de leitura composta/segura, prefira uma RPC nova a lógica no cliente.
3. Tabela/coluna/policy nova → alinhe como mudança de ecossistema, com RLS desde o nascimento.
4. Documente o novo objeto aqui e a decisão em `docs/DECISIONS.md`.

## Migrations e edge functions → repo `onlyfit-supabase`

**Este repo não tem mais pasta `supabase/`.** Migrations, edge functions (inclusive `send-password-reset`, `send-signup-confirmation`, `create-r2-upload-url`) e o tooling de push vivem em [`onlyfit-supabase`](https://github.com/MATHEUSELEVEA/onlyfit-supabase), fonte única do backend compartilhado com o desktop.

- Mudança de schema, policy ou function → PR no `onlyfit-supabase` (checkout irmão: `../onlyfit-supabase`), seguindo o CLAUDE.md de lá.
- Toda migration precisa ser retrocompatível com o código deployado dos **dois** apps.

## Nomenclatura

- Tabelas e colunas em `snake_case`, seguindo o padrão já existente no v1. Não introduza convenção nova.
- Timestamps `created_at`/`updated_at` em UTC.
