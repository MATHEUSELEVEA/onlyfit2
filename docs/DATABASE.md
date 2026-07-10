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

- RPC `feed_home_posts_page(p_limit, p_offset, p_sports)` → ids ordenados do feed.
- Tabela `posts` (+ join `profiles` via `creator_id`) → conteúdo do post.
- `post_likes`, `creator_follows`, `subscriptions` → interações (em evolução).

> Mantenha esta lista curta e verdadeira: registre aqui só o que o app **realmente** consome. O schema completo é do v1.

## Ao precisar de um dado novo

1. Veja se já existe tabela/RPC no v1 que serve. Reuse antes de criar.
2. Se precisar de leitura composta/segura, prefira uma RPC nova a lógica no cliente.
3. Tabela/coluna/policy nova → alinhe como mudança de ecossistema, com RLS desde o nascimento.
4. Documente o novo objeto aqui e a decisão em `docs/DECISIONS.md`.

## Nomenclatura

- Tabelas e colunas em `snake_case`, seguindo o padrão já existente no v1. Não introduza convenção nova.
- Timestamps `created_at`/`updated_at` em UTC.
