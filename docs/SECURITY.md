# SECURITY.md

O app é um SPA público falando direto com o Supabase. **Trate tudo que vai pro cliente como público.** A segurança real mora no banco (RLS) e nas funções de servidor do ecossistema — nunca no front.

## Segredos

- No front só entra a **`anon key`** do Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Ela é pública por design e protegida por RLS.
- **Nunca** coloque no bundle: `service_role` key, chave/secret de gateway de pagamento (Asaas etc.), token de admin, webhook secret, qualquer credencial privada. Tudo que o Vite injeta com prefixo `VITE_` **vai parar no JavaScript público** — não use `VITE_` para segredo.
- `.env` está no `.gitignore` e fica assim. Commite só `.env.example` com chaves vazias.
- Vazou uma chave? Rotacione no Supabase/gateway **antes** de qualquer outra coisa e registre em `docs/DECISIONS.md`.

## Autorização

- **RLS é a fronteira.** O front pode esconder um botão por UX, mas quem decide o que o usuário lê/escreve é a policy do Postgres. Nunca confie em "a tela não mostra".
- Todo acesso a conteúdo pago (assinatura, produto comprado) é verificado no banco. Não implemente "liberação" checando algo só no cliente.
- Toda tabela nova nasce com RLS **ligado** e policy explícita. Sem policy = ninguém acessa (o correto), não "todo mundo acessa". Ver `docs/DATABASE.md`.

## Autenticação

- Sessão via Supabase Auth (`persistSession` + `autoRefreshToken`), guardada pelo SDK. Não reimplemente storage de token.
- Não logue tokens, sessão, e-mail ou senha em `console`.
- Rotas/telas sensíveis checam `session` do `AuthContext`, mas isso é UX — o dado só vem se o RLS deixar.

## Entrada e saída

- Todo dado vindo do usuário ou do banco é **não confiável** ao renderizar. Não use `dangerouslySetInnerHTML` com conteúdo de usuário. React já escapa por padrão — mantenha assim.
- Valide upload/URL de mídia antes de exibir. Não confie no `content-type` declarado.
- Links externos de terceiros com `rel="noopener noreferrer"`.

## Dependências

- Mínimo de dependências (ver `docs/CODING-STANDARDS.md`). Cada dep é superfície de ataque.
- Rode `npm audit` antes de release; trate vulnerabilidade alta/crítica antes de subir.
- Não adicione lib de fonte duvidosa nem script de terceiro no `index.html` sem necessidade clara.

## Pagamentos e dados sensíveis

- O app **não processa pagamento no cliente**. Cobrança, split e recorrência vivem no backend do ecossistema (ver `docs/ECOSYSTEM.md`). O front só reflete estado.
- Nunca armazene dado de cartão. Nunca.

## Checklist de segurança do PR

- [ ] Nenhum segredo, chave privada ou token no diff nem no bundle.
- [ ] Tabela/RPC nova tem RLS e policy pensadas.
- [ ] Nada sensível em `console.log`.
- [ ] Sem `dangerouslySetInnerHTML` com dado de usuário.
- [ ] Acesso pago validado no banco, não só na tela.
