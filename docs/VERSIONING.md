# VERSIONING.md

Como versionamos o app. Enquanto é pré-1.0, otimizamos para velocidade com rastreabilidade, não para cerimônia.

## Versão do app

- **SemVer** (`MAJOR.MINOR.PATCH`), campo `version` no `package.json`. Hoje: `0.x` — fase inicial, API/UX ainda mudam.
- Em `0.x`: `MINOR` sobe a cada conjunto de features entregue; `PATCH` para correções. Breaking change não trava release nesta fase, mas **é registrado** em `docs/DECISIONS.md`.
- `1.0.0` quando a base web estabilizar (feed + interações reais + telas principais + fluxo de assinatura refletido). A partir daí, SemVer "de verdade": breaking → `MAJOR`.

## Tags e release

- Release marcada com tag `v<versão>` no merge que sobe a `version`.
- Deploy é contínuo por `main` (Netlify); "release" aqui é um marco anotado, não um gate de deploy.
- Mudança relevante do release resumida no PR e, se estrutural, em `docs/DECISIONS.md`.

## Compatibilidade com o ecossistema

- O banco é **compartilhado com o v1 em produção**. Mudança de schema/contrato de dado é versionada como **decisão de ecossistema**, não como bump de front. Nunca quebre o contrato que o v1 depende. Ver `docs/ECOSYSTEM.md` e `docs/DATABASE.md`.
- Contrato de RPC (nome, parâmetros, retorno) é interface pública entre app e banco: mudou de forma incompatível → trate como breaking e registre.

## Dependências

- Atualização de dependência é `chore(deps)` (ver `docs/COMMIT-TEMPLATE.md`), em PR próprio, com build/lint verdes.
- Não suba major de dependência junto com feature — separe para isolar risco.
