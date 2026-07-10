# AGENTS.md

Arquivo padrão para agentes de IA (Cursor, GitHub Copilot, OpenAI Codex, Windsurf, Gemini e afins) que procuram um `AGENTS.md` na raiz do projeto.

## Leia o CLAUDE.md

O documento canônico deste repositório é **[`CLAUDE.md`](./CLAUDE.md)**. Ele vale para **qualquer** modelo ou ferramenta, não só o Claude. Leia-o inteiro antes de sugerir ou escrever código.

As regras invioláveis, a stack, como rodar e a estrutura de pastas estão lá. O detalhamento por tema está em [`docs/`](./docs/DOCUMENTATION-INDEX.md).

## Resumo mínimo (o CLAUDE.md manda)

- **Nunca** cor hardcoded — use tokens de tema (`bg-surface`, `text-primary`). O usuário troca de tema em runtime.
- **Nunca** tamanho de fonte arbitrário — use tokens (`text-body`, `text-label`).
- **Nunca** segredo no cliente — só a `anon key` do Supabase vai pro front. RLS autoriza acesso, não o front.
- **Simples > esperto.** Sem dependência, abstração ou arquivo a mais sem necessidade. Apague o que não usa.
- Antes de "pronto": `npm run build` e `npm run lint` limpos, e teste o fluxo real no app.

Qualquer conflito entre este resumo e o `CLAUDE.md`: **o `CLAUDE.md` vence.**
