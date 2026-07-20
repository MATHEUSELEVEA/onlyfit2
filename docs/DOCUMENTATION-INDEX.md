# DOCUMENTATION-INDEX.md

Mapa de toda a documentação do OnlyFit v2. Comece pelo topo.

## Ponto de entrada (raiz)

| Arquivo | Para quê |
|---|---|
| [`../CLAUDE.md`](../CLAUDE.md) | **Comece aqui.** Regras invioláveis, stack, como rodar. Documento canônico para qualquer IA ou pessoa. |
| [`../AGENTS.md`](../AGENTS.md) | Aponta outras ferramentas de IA (Cursor, Codex, Copilot…) para o `CLAUDE.md`. |
| [`../README.md`](../README.md) | Visão geral e instruções de execução. |

## Contexto de produto

| Arquivo | Para quê |
|---|---|
| [`ECOSYSTEM.md`](./ECOSYSTEM.md) | O que é o OnlyFit, os 4 pilares, e onde este app se encaixa (v1 × v2). |

## Como o código é feito

| Arquivo | Para quê |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Camadas, feature-first, fluxo de dados, escalabilidade. |
| [`CODING-STANDARDS.md`](./CODING-STANDARDS.md) | Código limpo e simples: TS, React, nomes, o que não fazer. |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | Tokens, multi-tema (base Azul), tipografia, componentes. |
| [`MESSAGING-AND-CACHE.md`](./MESSAGING-AND-CACHE.md) | React Query: query keys, cache, mutations, invalidação. |

## Dados e integração

| Arquivo | Para quê |
|---|---|
| [`DATABASE.md`](./DATABASE.md) | Supabase de produção compartilhado, RLS, RPCs, cuidados. |
| [`API-GUIDELINES.md`](./API-GUIDELINES.md) | Como consumir Supabase (SDK/RPC), paginação, erros, tipagem. |
| [`SECURITY.md`](./SECURITY.md) | Segredos, autorização por RLS, auth, dependências, pagamentos. |

## Processo e qualidade

| Arquivo | Para quê |
|---|---|
| [`GIT-FLOW.md`](./GIT-FLOW.md) | Branches, commits, PR, deploy. |
| [`COMMIT-TEMPLATE.md`](./COMMIT-TEMPLATE.md) | Padrão de mensagem de commit (Conventional Commits). |
| [`PR-CHECKLIST.md`](./PR-CHECKLIST.md) | Checklist obrigatório antes do review. |
| [`TESTING.md`](./TESTING.md) | Testar o fluxo de verdade + stack de teste a adotar. |
| [`IOS-NATIVE-READINESS.md`](./IOS-NATIVE-READINESS.md) | Checklist de build nativo iOS, HealthKit real, App Store e bloqueios externos. |
| [`VERSIONING.md`](./VERSIONING.md) | SemVer, releases, compatibilidade com o ecossistema. |
| [`DECISIONS.md`](./DECISIONS.md) | Registro de decisões de arquitetura (ADR). |
| [`ONBOARDING.md`](./ONBOARDING.md) | Do zero ao primeiro PR. |

## Referências de design

| Pasta | Para quê |
|---|---|
| [`temas/`](./temas/) | Specs de cor dos 2 temas (fonte da verdade da paleta). |
| [`telas/`](./telas/) | Referências visuais de tela. |

## Regra de manutenção

Mudou o comportamento? Atualize a doc no **mesmo PR**. Doc desatualizada é pior que doc ausente — vira lixo que engana. Decisão estrutural entra em `DECISIONS.md`.
