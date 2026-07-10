# COMMIT-TEMPLATE.md

Padrão de mensagem de commit: **Conventional Commits**. Curto, no imperativo, com o porquê quando ajudar.

## Formato

```
tipo(escopo): resumo no imperativo, minúsculo, sem ponto final

Corpo opcional: o PORQUÊ da mudança, não o que o diff já mostra.
Quebre em linhas de ~72 colunas.

Refs: #issue (se houver)
```

## Tipos

| Tipo | Quando |
|---|---|
| `feat` | funcionalidade nova para o usuário |
| `fix` | correção de bug |
| `refactor` | muda o código sem mudar o comportamento |
| `style` | formatação/CSS que não altera lógica |
| `chore` | build, deps, config, tooling |
| `docs` | só documentação |
| `test` | só testes |
| `perf` | melhoria de performance |

## Escopo (opcional, mas ajuda)

O domínio afetado: `feed`, `theme`, `auth`, `profile`, `explore`, `deps`, `docs`.

## Exemplos bons

```
feat(feed): persistir curtida em post_likes com optimistic update
fix(theme): corrigir contraste do texto no tema laranja
chore(deps): subir @tanstack/react-query para 5.66
docs(security): reforçar regra de segredo só no servidor
refactor(feed): extrair PostCaption de PostCard
```

## Exemplos ruins (não faça)

```
update            (sem tipo, sem o quê)
fix bug           (qual bug?)
WIP               (não commite WIP em main)
feat: várias coisas + formatação + refactor   (misturou tudo)
```

## Regras

- Imperativo: "adiciona", não "adicionado"/"adicionando".
- Um commit, uma intenção. Ver `docs/GIT-FLOW.md`.
- Sem emoji no início, sem ruído. Mensagem serve pra ler o histórico em 6 meses.
