# OnlyFit v2

Nova versão do OnlyFit — plataforma de assinatura, comunidade e marketplace fitness (ver `../onlyfit/BASE_PARA_UX.md`). App **mobile-first**, construído do zero com base limpa, consumindo o **mesmo banco Supabase de produção** do onlyfit v1.

## Stack

- **Vite + React 18 + TypeScript** (strict)
- **Tailwind CSS** com design tokens por tema (CSS variables)
- **Supabase** (`lygynazgwdxhecgceffc` — mesmo projeto do v1)
- **TanStack Query** para dados, **React Router** para navegação
- **Netlify** para deploy (`netlify.toml`)

## Rodar localmente

```bash
npm install
npm run dev   # http://localhost:5180
```

O `.env` já aponta para o Supabase real (apenas chaves públicas `anon`). Faça login com uma conta real do app — o RLS exige usuário autenticado para ler o feed.

## Temas

Três temas definidos em `temas/DESIGN {PRETO,AZUL,LARANJA}.md`, gerados como variáveis CSS em `src/theme/themes.css` (triplas RGB para suportar opacidade do Tailwind, ex. `bg-surface/80`):

- **preto** — Premium Performance (padrão)
- **azul** — Aura Precision
- **laranja** — Premium Performance Editorial

A troca é feita em **Perfil → Tema do aplicativo** (`data-theme` no `<html>`, persistido em `localStorage`). Nunca use cor hardcoded em componente — sempre tokens (`bg-surface`, `text-on-surface`, `bg-primary`…).

**Importante:** cor é a única coisa que muda por tema. Tipografia é global (ver seção abaixo) e igual nos três temas — os 3 designs em `temas/` divergiam em fonte (Archivo Narrow, JetBrains Mono...), mas essa parte foi deliberadamente sobrescrita pelo padrão TikTok abaixo.

## Tipografia (padrão TikTok — vale para todas as páginas)

O app inteiro usa uma única família sans (Inter, com fallback para a stack de fontes do sistema) e hierarquia por peso/tamanho, não por fonte diferente. Nunca use `uppercase` ou `letter-spacing` em texto de uso geral (botões, nav, corpo) — isso não é o estilo TikTok. A única exceção é `text-eyebrow`, reservado para cabeçalhos pequenos e discretos de seção (ex. "Tema do aplicativo" em Perfil), que mantém uppercase + tracking sutil de propósito.

Tokens definidos em `tailwind.config.ts` (`fontFamily.sans` + `fontSize`):

| Token | Tamanho | Peso | Uso |
|---|---|---|---|
| `text-display` | 32px | 800 | Wordmark / telas de entrada |
| `text-title-lg` | 22px | 700 | Título de página (Perfil, Explorar...) |
| `text-title` | 17px | 700 | Título de seção / app bar |
| `text-handle` | 16px | 700 | @usuario sobre a mídia do post |
| `text-body` | 14px | 400 | Corpo de texto principal |
| `text-body-sm` | 13px | 400 | Texto secundário/meta |
| `text-label` | 13px | 600 | Botões e pills (Seguir, Assinar, Entrar) |
| `text-counter` | 12px | 600 | Contadores sob ícones de ação |
| `text-nav` | 10px | 500 | Rótulos da tab bar inferior |
| `text-eyebrow` | 11px | 600 | Cabeçalho discreto de seção (uppercase) |

Sempre use `font-sans text-{token}` — nunca tamanhos arbitrários (`text-[13px]`) nem `font-bold`/`font-semibold` soltos, já que o peso já vem embutido no token.

## Estrutura

```
src/
  components/       # UI compartilhada (AppShell, BottomNav, ...)
  contexts/         # AuthContext (sessão Supabase)
  features/
    feed/           # Tela inicial: feed vertical estilo Reels
  lib/              # supabase client
  pages/            # Páginas (Login, Perfil, placeholders)
  theme/            # themes.css (gerado) + ThemeProvider
```

## Dados do feed (mesmo modelo do v1)

- RPC `feed_home_posts_page(p_limit, p_offset, p_sports)` → ids ordenados do feed
- Tabela `posts` (+ join `profiles` via `creator_id`) → conteúdo
- `post_likes`, `creator_follows`, `subscriptions` → interações (próximas etapas)

## Roadmap curto

- [x] Scaffold + temas + login + feed (leitura)
- [ ] Curtir/salvar persistidos, seguir/assinar reais
- [ ] Banner de produto no post (venda)
- [ ] Explorar, Treino, Produtos, Perfil completo
- [ ] Capacitor (iOS/Android) quando a base web estabilizar
