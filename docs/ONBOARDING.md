# ONBOARDING.md

Do zero ao primeiro PR. Se você é pessoa ou IA chegando agora, siga na ordem.

## 1. Entenda antes de codar (15 min)

1. `CLAUDE.md` (raiz) — as regras que não se quebram.
2. `docs/ECOSYSTEM.md` — o que é o OnlyFit e onde este app entra.
3. `docs/ARCHITECTURE.md` — como o código é organizado.
4. Folheie `docs/DESIGN-SYSTEM.md`, `docs/CODING-STANDARDS.md` e `docs/SECURITY.md`.

## 2. Suba o ambiente

```bash
cd onlyfit
npm install
cp .env.example .env      # preencha com as chaves anon do Supabase
npm run dev               # http://localhost:5180
```

- `.env` só tem chave pública `anon`. Peça as chaves a quem já tem — nunca comite `.env`.
- Faça login com **conta real** do app: o RLS exige usuário autenticado para ler o feed.

## 3. Confira que está saudável

```bash
npm run build   # typecheck strict + build
npm run lint
```

Ambos limpos = ambiente ok.

## 4. Onde mexer

- Nova tela → `src/pages` + rota em `src/App.tsx`.
- Novo domínio (feed, chat, produtos) → pasta em `src/features/<dominio>` com sua UI + hooks + tipos.
- Dado do Supabase → hook `useX` com React Query (`docs/MESSAGING-AND-CACHE.md`).
- Cor/tema → `src/theme` + `docs/temas`; **nunca** hex em componente (`docs/DESIGN-SYSTEM.md`).

## 5. Antes do primeiro PR

- Rode o fluxo de verdade no app (`docs/TESTING.md`).
- Passe pelo `docs/PR-CHECKLIST.md`.
- Commits no padrão `docs/COMMIT-TEMPLATE.md`; branch conforme `docs/GIT-FLOW.md`.

## Dúvidas frequentes

- **Feed vazio / erro ao carregar?** Você está logado? RLS bloqueia anônimo.
- **Cor não muda ao trocar tema?** Tem hex hardcoded no componente — troque por token.
- **Erro de env ao subir?** Faltou preencher `.env` (o client lança erro proposital se faltar chave).
- **Preciso de dado que não existe no front?** Veja se o v1/banco já tem antes de criar (`docs/DATABASE.md`).
