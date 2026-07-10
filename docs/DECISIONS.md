# DECISIONS.md

Registro leve de decisões de arquitetura (ADR). Cada entrada explica **por que** algo é como é, para ninguém (pessoa ou IA) desfazer sem contexto. Adicione ao fim; nunca reescreva o passado — supersede com uma entrada nova.

## Formato

```
## NNNN — Título curto
- Data: AAAA-MM-DD
- Status: aceita | supersedida por NNNN | revertida
- Contexto: qual problema/força motivou.
- Decisão: o que foi decidido.
- Consequência: o que isso implica (bom e ruim).
```

---

## 0001 — Reescrever o front do zero (v2) sobre o banco de produção do v1
- Data: 2026-07-10
- Status: aceita
- Contexto: o v1 acumulou dívida técnica; queríamos base mobile-first limpa sem perder os dados/usuários reais.
- Decisão: novo app (`onlyfit/`) do zero, consumindo o **mesmo** Supabase de produção do v1. Regra de negócio sensível continua no ecossistema/banco.
- Consequência: liberdade no front; porém banco é produção compartilhada — mudança de schema vira decisão de ecossistema e exige cuidado redobrado. Ver `docs/ECOSYSTEM.md`.

## 0002 — Multi-tema por tokens; só a cor muda
- Data: 2026-07-10
- Status: aceita
- Contexto: três propostas de design (preto/azul/laranja) divergiam em cor **e** fonte; o usuário deve poder trocar de tema.
- Decisão: cor via tokens (`themes.css` + Tailwind + `data-theme`, persistido em `localStorage`); tipografia unificada no padrão "TikTok" (Inter, hierarquia por peso), igual nos 3 temas. Referência estrutural do design: tema Azul. Padrão: preto.
- Consequência: componentes nunca conhecem cor concreta → novo tema não toca componente. Fontes das specs de tema são ignoradas de propósito. Ver `docs/DESIGN-SYSTEM.md`.

## 0003 — Estado de servidor no React Query; sem fetch em useEffect
- Data: 2026-07-10
- Status: aceita
- Contexto: evitar cache manual, `useEffect` de fetch e bugs de sincronização.
- Decisão: toda leitura/escrita do Supabase passa por hooks React Query; `useState` só para UI local.
- Consequência: menos código de sincronização, cache/retry padronizados. Ver `docs/MESSAGING-AND-CACHE.md`.

## 0004 — Remover `baseUrl` do tsconfig (deprecação TS 7.0)
- Data: 2026-07-10
- Status: aceita
- Contexto: `baseUrl` foi preterido e o TS avisa que deixará de funcionar na 7.0.
- Decisão: remover `baseUrl` e usar `paths` com caminho relativo (`"@/*": ["./src/*"]`), resolvido em relação ao tsconfig. O alias de runtime já é resolvido pelo Vite (`vite.config.ts`).
- Consequência: sem warning de deprecação; typecheck e alias `@/` seguem funcionando.
