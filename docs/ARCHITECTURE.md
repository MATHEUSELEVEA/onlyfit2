# ARCHITECTURE.md

Como o app é montado e por quê. Mantém decisões estruturais num só lugar para não reinventarmos a cada feature.

## Visão

SPA React servida estática pela Netlify. Todo o backend é **Supabase** (Postgres + Auth + Storage + RPC). Não há servidor próprio: o front fala direto com o Supabase, e o **RLS do Postgres** é a fronteira de segurança. Nada de lógica de autorização confiando só no cliente.

```
[React SPA / Netlify]  ──HTTPS──▶  [Supabase]
   TanStack Query                    Postgres + RLS
   Auth (anon key)                   Auth / Storage
                                     RPC (funções SQL)
```

## Camadas no front

| Camada | Pasta | Responsabilidade |
|---|---|---|
| Páginas/rotas | `src/pages` | Uma tela por rota. Composição, sem regra de negócio pesada. |
| Features | `src/features/<dominio>` | Domínio vertical (ex. `feed/`): componentes + hooks + tipos + queries daquele domínio, juntos. |
| UI compartilhada | `src/components` | Layout e widgets reusados entre features (`AppShell`, `BottomNav`, `MenuDrawer`). |
| Contextos | `src/contexts` | Estado global mínimo (`AuthContext`). |
| Libs | `src/lib` | Clients e utilitários sem estado (`supabase`). |
| Tema | `src/theme` | `ThemeProvider` + `themes.css` (gerado a partir de `docs/temas/`). |

## Princípios

1. **Feature-first, não type-first.** Código do mesmo domínio mora junto (`features/feed/` tem sua UI, seus hooks `useFeed`, seus `types`). Não crie pastas globais `hooks/`, `utils/`, `types/` que viram depósito.
2. **Dados via TanStack Query.** Toda leitura do Supabase passa por um hook `useX` com React Query (cache, retry, estados de loading/erro padronizados). Nada de `useEffect` + `useState` para buscar dados. Ver `docs/MESSAGING-AND-CACHE.md`.
3. **Supabase é acessado só por `src/lib/supabase.ts`.** Um único client. Features importam esse client, nunca criam outro.
4. **O banco autoriza.** O front pode esconder um botão por UX, mas quem garante acesso é o RLS. Ver `docs/DATABASE.md` e `docs/SECURITY.md`.
5. **Tema é dado, não código.** Cor sai de `docs/temas/*.md` → `src/theme/themes.css` → tokens Tailwind. Componente nunca conhece hex. Ver `docs/DESIGN-SYSTEM.md`.

## Fluxo de uma leitura (ex.: feed)

1. `FeedPage` chama o hook `useFeed`.
2. `useFeed` usa React Query para chamar a RPC `feed_home_posts_page(p_limit, p_offset, p_sports)` → ids ordenados.
3. Hidrata `posts` (+ join `profiles`) para o conteúdo.
4. RLS garante que só posts visíveis ao usuário autenticado voltam.
5. Componentes consomem o resultado já tipado (`features/feed/types.ts`).

## O que NÃO fazer

- Não adicionar gerenciador de estado global (Redux/Zustand) enquanto Context + React Query resolverem.
- Não criar "camada de serviço" genérica sobre o Supabase. O client já é a camada.
- Não colocar regra de negócio sensível (preço, split, liberação de acesso pago) no front — isso vive no banco/edge do ecossistema. Ver `docs/ECOSYSTEM.md`.

## Escalabilidade

- **Paginação sempre** em listas (RPC com `limit/offset` ou cursor). Nunca `select *` sem limite.
- **Code-splitting por rota** quando o bundle crescer (`React.lazy` nas páginas pesadas).
- Novos domínios = nova pasta em `features/`, não inchar `pages/`.
- Mudou algo estrutural? Registre em `docs/DECISIONS.md`.
