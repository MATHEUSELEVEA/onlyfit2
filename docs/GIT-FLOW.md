# GIT-FLOW.md

Fluxo de branches e commits. Simples de propósito: trunk-based com branches curtas.

> ## ⛔ Regra inegociável (vale para pessoas E agentes de IA)
> **Nunca** commite nem faça push direto na `main`. Quando o usuário pedir PR, merge ou deploy, **nunca** faça só localmente: o fluxo obrigatório é **branch a partir da `main` → commit → push da branch → Pull Request para `main` → merge do PR**.
>
> Agente de IA (Claude Code e afins): commit local sem push/PR/merge não conclui a tarefa. Antes de qualquer `git commit`, verifique a branch atual; se for `main`, **crie uma branch primeiro** (`git checkout -b feat/<slug>`), commite lá, faça push, abra o PR (`gh pr create`) e só então mergeie (`gh pr merge --squash`). Isto é a regra 9 do `CLAUDE.md`.

## Branches

- **`main`** — sempre verde (build + lint passando) e em estado deployável. Netlify publica a partir dela.
- **Branch de trabalho** curta a partir de `main`, com prefixo:
  - `feat/<slug>` — funcionalidade nova
  - `fix/<slug>` — correção
  - `chore/<slug>` — build, deps, config, docs
  - `refactor/<slug>` — refatoração sem mudança de comportamento
- Slug curto e em kebab-case: `feat/post-like-persistente`.
- Nada de branch de vida longa acumulando semanas de mudança. Fatie o trabalho.

## Commits

- Um commit = uma mudança coerente. Não misture refactor + feature + formatação no mesmo commit.
- **Conventional Commits** (ver `docs/COMMIT-TEMPLATE.md`): `tipo(escopo): descrição no imperativo`.
- Mensagem explica o **porquê** quando não for óbvio.
- Não commite: `.env`, `dist/`, `node_modules/`, `.DS_Store`, arquivo de scratch, `console.log`.

## Antes de abrir PR

1. Rebase/atualize com `main`.
2. `npm run build` e `npm run lint` limpos.
3. Testou o fluxo de verdade (ver `docs/TESTING.md`).
4. Passou pelo `docs/PR-CHECKLIST.md`.

## Pull Request

- PR pequeno e focado — mais fácil de revisar, menos risco. Se passou de ~400 linhas de diff, provavelmente dá pra fatiar.
- Descreva **o que** muda e **por quê**, com como testar.
- Merge por **squash** para manter `main` linear e legível.
- Mudança estrutural/decisão relevante → registre em `docs/DECISIONS.md` no mesmo PR.

## Deploy

- Merge em `main` → Netlify builda (`npm run build`) e publica `dist/`.
- `main` quebrada é emergência: reverta o PR problemático primeiro, investigue depois.
