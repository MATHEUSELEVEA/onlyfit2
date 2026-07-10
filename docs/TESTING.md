# TESTING.md

Como garantimos que algo funciona. O princípio vale desde já; a stack de teste automatizado é adotada de forma incremental (hoje o projeto ainda não tem test runner instalado).

## Princípio: teste o fluxo de verdade

Compilar não é testar. Antes de dar por pronto, **exercite o caminho real no app rodando** (`npm run dev`, http://localhost:5180), com uma conta real (o RLS exige login). Veja acontecer:

- Fluxo feliz funciona.
- Estados de **loading, vazio e erro** aparecem corretos (desligue a rede, use conta sem dado).
- Nos **3 temas** (preto/azul/laranja) não quebra nada. Ver `docs/DESIGN-SYSTEM.md`.
- Em **tela estreita** (mobile-first) o layout se mantém.

Sempre roda antes de PR: `npm run build` (typecheck strict) + `npm run lint`.

## Stack de teste automatizado (padrão a adotar)

Quando formos automatizar, seguimos o que o v1 já usa, para consistência no ecossistema:

- **Vitest** — unidade/integração (lógica de hooks, helpers, transformação de dados).
- **@testing-library/react** — comportamento de componente pela ótica do usuário (o que ele vê/clica), não detalhe interno.
- **Playwright** — E2E dos fluxos críticos (login, feed, assinar).

Scripts a acrescentar quando entrarem (`package.json`):

```jsonc
"test": "vitest run",
"test:watch": "vitest",
"e2e": "playwright test"
```

## O que priorizar em teste automatizado

1. **Lógica pura primeiro:** transformação de dado do feed, formatação, regras de visibilidade no cliente. Barato e alto valor.
2. **Hooks de dados:** `useFeed` e afins, com o Supabase mockado — garante chave de query, paginação e tratamento de erro.
3. **E2E só dos fluxos que doem se quebrarem:** autenticar, carregar feed, assinar/comprar (quando existir).

Não persiga cobertura por número. Cobrir 100% de getters triviais é lixo; cobrir o fluxo de acesso pago vale ouro.

## Regras

- Teste **comportamento**, não implementação. Refatorar não deve quebrar teste bom.
- Nada de teste contra o banco de produção. E2E/integração usam dados de teste isolados / ambiente próprio, nunca `DELETE` em produção. Ver `docs/DATABASE.md`.
- Teste que falha às vezes (flaky) é conserto urgente ou remoção — teste instável destrói confiança.
- Todo bug corrigido que valha a pena ganha um teste que o reproduz, quando a stack estiver no lugar.
