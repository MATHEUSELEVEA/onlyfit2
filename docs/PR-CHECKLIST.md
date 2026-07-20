# PR-CHECKLIST.md

Rode esta lista antes de pedir review. Serve para pessoa e para IA. Se um item falha, o PR não está pronto.

## Funciona

- [ ] `npm run build` passa (typecheck strict + build), sem erro nem warning novo.
- [ ] `npm run lint` limpo.
- [ ] Testei o fluxo **de verdade** no app rodando, não só compilei. (`docs/TESTING.md`)
- [ ] Estados de loading, vazio e erro tratados na UI — nada de tela branca.
- [ ] Se mexeu em iOS/HealthKit: seguir `docs/IOS-NATIVE-READINESS.md` e testar em iPhone físico/TestFlight quando o Xcode estiver disponível.

## Limpo e simples

- [ ] Sem `console.log`, código comentado, arquivo morto ou import/dependência não usada.
- [ ] Sem `any`, sem `@ts-ignore`.
- [ ] Nada de abstração/camada/dependência nova sem necessidade real. (`docs/CODING-STANDARDS.md`)
- [ ] Diff focado num só assunto; PR fatiado se estava grande demais.

## Design / tema

- [ ] Zero cor hardcoded — só tokens (`bg-surface`, `text-primary`…).
- [ ] Zero tamanho de fonte arbitrário / `font-bold` solto — só tokens de tipografia.
- [ ] Testei nos 2 temas (preto/claro): sem quebra e com contraste ok. (`docs/DESIGN-SYSTEM.md`)
- [ ] Layout íntegro em tela estreita (mobile-first).

## Dados / segurança

- [ ] Leitura via hook React Query; nada de `fetch` em `useEffect`. (`docs/MESSAGING-AND-CACHE.md`)
- [ ] Listas paginadas, sem `select *` sem limite. (`docs/DATABASE.md`)
- [ ] `error` de chamadas Supabase verificado e tratado.
- [ ] Nenhum segredo/chave privada no diff ou no bundle. (`docs/SECURITY.md`)
- [ ] Tabela/RPC nova tem RLS e policy; acesso pago validado no banco, não na tela.

## Registro

- [ ] Commits no padrão Conventional Commits. (`docs/COMMIT-TEMPLATE.md`)
- [ ] Decisão estrutural relevante registrada em `docs/DECISIONS.md`.
- [ ] Doc afetada atualizada (ex. objeto novo em `docs/DATABASE.md`).
