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

## As 6 regras que não se quebram

1. **Nunca cor hardcoded.** Sempre tokens (`bg-surface`, `text-on-surface`, `bg-primary`). O usuário troca de tema em runtime — cor hardcoded quebra isso. Ver `docs/DESIGN-SYSTEM.md`.
2. **Nunca tamanho de fonte arbitrário** (`text-[13px]`) nem `font-bold` solto. Só tokens (`text-body`, `text-label`…). Tipografia é global e igual nos 3 temas.
3. **Nunca segredo no cliente.** Só a `anon key` vai pro front. Nada de `service_role`, chave de gateway de pagamento ou secret no bundle. Ver `docs/SECURITY.md`.
4. **RLS é a fonte da verdade de acesso**, não o front. Não confie em esconder botão — o banco autoriza. Ver `docs/DATABASE.md` e `docs/SECURITY.md`.
5. **Simples > esperto.** Não adicione dependência, abstração, camada ou "framework interno" sem necessidade real. Menos código é a meta. Ver `docs/CODING-STANDARDS.md`.
6. **Sem lixo.** Nada de arquivo morto, `console.log` esquecido, código comentado, `TODO` órfão ou dependência não usada. Se não é usado, apague.

## Onde as coisas ficam

```
src/
  components/   UI compartilhada (AppShell, BottomNav, MenuDrawer)
  contexts/     AuthContext (sessão Supabase)
  features/     domínios verticais — feed/ (Reels vertical)
  lib/          clients (supabase)
  pages/        páginas de rota
  theme/        themes.css (gerado) + ThemeProvider
docs/           padrões e governança — comece por docs/DOCUMENTATION-INDEX.md
docs/temas/     specs de cor dos 3 temas (fonte da verdade do design)
docs/telas/     referências visuais de tela
```

## Antes de dar por pronto

- `npm run build` passa (typecheck strict + build).
- `npm run lint` limpo.
- Testou o fluxo de verdade no app, não só compilou. Ver `docs/TESTING.md`.
- Passou pelo `docs/PR-CHECKLIST.md`.

## Índice completo → `docs/DOCUMENTATION-INDEX.md`

> Outros modelos/ferramentas de IA: `AGENTS.md` (na raiz) aponta para cá. Este é o documento canônico.
