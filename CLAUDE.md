# CLAUDE.md — OnlyFit v2

Guia curto para qualquer agente de IA ou pessoa que for mexer neste repositório.
**Leia isto inteiro antes de escrever código.** O detalhe fica em `docs/` (ver índice).

## O que é

App **mobile-first** de assinatura, comunidade e marketplace fitness (o "OnlyFans do fit").
Reescrita limpa do v1, consumindo o **mesmo banco Supabase de produção**. Contexto de produto: `docs/ECOSYSTEM.md`.

## Stack

Vite · React 18 · TypeScript (strict) · Tailwind (tokens por tema) · Supabase · TanStack Query · React Router · Netlify.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # tsc --noEmit + vite build
npm run lint
```

`.env` tem só chaves públicas (`anon`). Login com conta real — RLS exige usuário autenticado.

## As 8 regras que não se quebram

1. **Nunca cor hardcoded.** Sempre tokens (`bg-surface`, `text-on-surface`, `bg-primary`). O usuário troca de tema em runtime — cor hardcoded quebra isso. Ver `docs/DESIGN-SYSTEM.md`.
2. **Nunca tamanho de fonte arbitrário** (`text-[13px]`) nem `font-bold` solto. Só tokens (`text-body`, `text-label`…). Tipografia é global e igual nos 3 temas.
3. **Nunca segredo no cliente.** Só a `anon key` vai pro front. Nada de `service_role`, chave de gateway de pagamento ou secret no bundle. Ver `docs/SECURITY.md`.
4. **RLS é a fonte da verdade de acesso**, não o front. Não confie em esconder botão — o banco autoriza. Ver `docs/DATABASE.md` e `docs/SECURITY.md`.
5. **Simples > esperto.** Não adicione dependência, abstração, camada ou "framework interno" sem necessidade real. Menos código é a meta. Ver `docs/CODING-STANDARDS.md`.
6. **Sem lixo.** Nada de arquivo morto, `console.log` esquecido, código comentado, `TODO` órfão ou dependência não usada. Se não é usado, apague.
7. **Cliente nunca escreve em tabela de pagamento.** O front só escreve interações do próprio usuário (`post_likes`, `post_comments`, `creator_follows`). `subscriptions`/`creator_memberships` são somente leitura — assinar é checkout no servidor. Ver `docs/DATABASE.md`.
8. **Nunca commite direto na `main`.** TODO trabalho — inclusive um único arquivo, um doc ou um ajuste trivial — vai em **branch → Pull Request → merge na `main`**. Sem exceção. Isto vale também para agentes de IA: nenhum agente commita ou faz push em `main`; abre branch (`feat/`, `fix/`, `chore/`…), PR e mergeia. Ver `docs/GIT-FLOW.md`.

## Onde as coisas ficam

```
src/
  components/
    layout/     casca do app (AppShell, BottomNav, MenuDrawer)
    ui/         widgets genéricos usados por 2+ features (BottomSheet, ShareSheet)
  contexts/     AuthContext (sessão Supabase)
  features/     domínios verticais — página + hooks + tipos juntos
    feed/       Reels vertical: FeedPage, PostCard, curtir/comentar/salvar
    explore/    descoberta: ExplorePage (creators + conteúdo + filtros)
    creators/   perfil público, seguir (persistido) e estado de assinatura
    profile/    perfil próprio + configurações + sair
  lib/          client supabase + utilitários puros (sports, format)
  pages/        só telas sem domínio ainda (Login, placeholders)
  theme/        themes.css (gerado) + ThemeProvider
docs/           padrões e governança — comece por docs/DOCUMENTATION-INDEX.md
docs/temas/     specs de cor dos 3 temas (fonte da verdade do design)
docs/telas/     referências visuais de tela
```

Padrão de dados: leitura = hook `useX` com React Query; escrita = `useMutation` com atualização otimista + rollback (`docs/ARCHITECTURE.md`, princípio 6).

## Antes de dar por pronto

- `npm run build` passa (typecheck strict + build).
- `npm run lint` limpo.
- Testou o fluxo de verdade no app, não só compilou. Ver `docs/TESTING.md`.
- Passou pelo `docs/PR-CHECKLIST.md`.
- **Abriu branch + PR e mergeou na `main` — nunca commit direto na `main`** (regra 8). Ver `docs/GIT-FLOW.md`.

## Índice completo → `docs/DOCUMENTATION-INDEX.md`

> Outros modelos/ferramentas de IA: `AGENTS.md` (na raiz) aponta para cá. Este é o documento canônico.
