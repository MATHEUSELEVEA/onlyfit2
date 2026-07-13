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

## 0005 — Escritas do cliente restritas a tabelas de interação
- Data: 2026-07-10
- Status: aceita
- Contexto: ao implementar curtir/comentar/seguir/assinar no v2, era preciso definir o que o front pode escrever no banco de produção compartilhado.
- Decisão: o cliente escreve apenas em `post_likes`, `post_comments` e `creator_follows` (linha do próprio usuário, garantida por RLS). `subscriptions`/`creator_memberships` são somente leitura — "Assinar" leva ao fluxo de checkout (futuro), nunca a um insert do front. Posts salvos ficam em `localStorage` até existir tabela.
- Consequência: impossível o front "liberar" conteúdo pago por engano; a lista de escritas vive em `docs/DATABASE.md` e cresce só com policy de RLS conferida.

## 0006 — Mutações otimistas com rollback como padrão de escrita
- Data: 2026-07-10
- Status: aceita
- Contexto: feed estilo Reels exige resposta imediata ao toque (curtir/seguir) mesmo com rede lenta.
- Decisão: toda escrita usa `useMutation` atualizando os caches do React Query em `onMutate` (com snapshot), revertendo em `onError`. Caches de outras features afetadas são atualizados por tipos estruturais mínimos (ex. follow atualiza feed e explorar sem acoplar imports).
- Consequência: UI instantânea e consistente entre telas; o custo é manter os updaters em sincronia com o shape dos caches (referências: `useToggleLike`, `useCreatorFollow`).

## 0007 — ESLint flat config no repositório
- Data: 2026-07-10
- Status: aceita
- Contexto: `npm run lint` existia no `package.json`, mas o ESLint nunca foi instalado/configurado — o gate de qualidade do CLAUDE.md não rodava.
- Decisão: adotar ESLint 9+ flat config (`eslint.config.js`) com `typescript-eslint`, `react-hooks` e `react-refresh`, além de `no-console` (permitindo `warn`/`error`).
- Consequência: `npm run lint` volta a valer como gate real de PR; regras de hooks pegam bugs de dependência em revisão.

## 0008 — `creator_profiles.sports` como única fonte de afinidade/modalidade; `category` sai do app
- Data: 2026-07-12
- Status: aceita
- Contexto: `creator_profiles.category` é texto livre do v1, sem taxonomia fixa (ex.: "HIPERTROFIA" em um creator de lutas), e estava exposto de duas formas conflitantes: como badge no perfil público (`CreatorProfilePage`) e como critério de afinidade na RPC `feed_home_available_sports` (agrupava creators pela mesma `category`). Isso gerava badges enganosos e um algoritmo de recomendação paralelo ao filtro real de esporte.
- Decisão: o app passa a considerar sempre `creator_profiles.sports` (taxonomia fixa de `src/lib/sports.ts`) tanto para exibição quanto para afinidade. O badge do perfil agora renderiza `sports` (via `sportLabel`), não mais `category`. A RPC `feed_home_available_sports` (migration `20260712150000_feed_affinity_by_sports.sql`) troca o agrupamento por `cp.category = cp.category` por interseção de array `cp.sports && preference.sports`, calculado a partir dos esportes dos creators que o usuário já seguiu/curtiu/assistiu. A coluna `creator_profiles.category` continua existindo no banco (é do schema do v1) mas nenhum código do onlyfit v2 lê ou escreve nela a partir de agora.
- Consequência: um único domínio (`sports`) rege filtro, exibição e recomendação — sem mais divergência entre o que o perfil mostra e o que o feed filtra. Se `category` precisar voltar a significar algo (ex. "especialidade comercial" distinta de modalidade), é uma decisão nova, com UI própria, não uma reintrodução silenciosa no fluxo atual.

## 0009 — Carrossel/imagem no feed via tabela `post_media`; mídia única continua em `posts`
- Data: 2026-07-12
- Status: aceita
- Contexto: o feed só suportava uma mídia por post (`posts.video_url`/`thumbnail_url` + `metadata.media_kind`), o que cobria vídeo e imagem únicos, mas não carrossel (várias páginas, cada uma imagem ou vídeo). Era preciso um lugar ordenado para N páginas por post sem redesenhar `posts` (schema é do v1, produção compartilhada).
- Decisão: nova tabela `public.post_media` (migration `20260712180000_post_media.sql`) com `post_id`, `position`, `kind`, `url`, `thumbnail_url`. Carrossel = 1 linha por página; **mídia única não grava aqui** e continua no formato do v1 (`video_url`/`thumbnail_url`), que o feed lê por fallback. O post sempre espelha a página de capa em `posts.thumbnail_url`/`video_url` para os grids de perfil e o v1 seguirem enxergando o post. RLS de `post_media`: SELECT delega à RLS de `posts` (subquery em `posts` respeita as policies existentes); escrita só pelo dono do post.
- Consequência: aditivo e compatível — o v1 ignora `post_media` e nada quebra; posts legados e de mídia única funcionam sem migração de dados. O feed unifica tudo em `FeedPost.media[]` (length 1 = única, >1 = carrossel). Custo: a página de capa vive em dois lugares (posts + post_media) para carrosséis; manter em sincronia é responsabilidade de quem escreve (hoje só `useCreatePost`). Aplicar a migration em produção é passo manual/revisado (não roda pelo app).

## 0010 — Estúdio de criação de post como módulo próprio, começando pelo básico
- Data: 2026-07-12
- Status: aceita
- Contexto: o v2 não tinha fluxo de publicação (só consumo). O objetivo de produto é paridade com o TikTok (edição, filtros, música, IA), mas grande demais para uma entrega. Precisávamos publicar imagem/vídeo/carrossel já, sem fechar portas para a evolução.
- Decisão: `features/studio/` isolado, em passos (escolher mídia → detalhes → publicar). Upload reusa a edge function do v1 `create-r2-upload-url` (buckets `onlyfit-media`/`onlyfit-thumbnails`); `media.ts` concentra os tipos puros (`DraftMedia`) como ponto de extensão para transformações futuras (filtros/IA/música) aplicadas antes do upload. Entrada pelo botão "Criar" (central) na `BottomNav`.
- Consequência: dá para postar hoje e evoluir o estúdio sem tocar feed nem modelo de dados. O básico intencionalmente não tem crop/trim/edição — quando entrarem, são transformações sobre `DraftMedia`. `posts.type` fica nulo por ora (refino de tipo de conteúdo é etapa futura).

## 0011 — Perfil de Saúde autodeclarado como ledger imutável e aditivo
- Data: 2026-07-13
- Status: aceita
- Contexto: o item “Perfil de Saúde” do mobile precisava virar uma funcionalidade real para anamnese, declarações clínicas, áudio transcrito e PDFs, sem acoplar o usuário aos fluxos legados de entrada por profissional. Os dados também precisam servir futuramente para contexto de IA, busca e consulta profissional.
- Decisão: o domínio novo usa tabelas aditivas `health_*`. `health_events` é o histórico oficial e imutável; correções são novos eventos ligados ao anterior. `health_event_facts` guarda fatos atômicos pesquisáveis. Questionários têm versões com o JSON completo das perguntas, e cada resposta confirmada preserva o snapshot usado. Texto é salvo sem IA; conversa interpreta localmente primeiro; áudio persiste somente a transcrição; PDF fica no R2 privado, passa por extração determinística e usa IA somente quando necessário e autorizado. Nenhum resultado de PDF vira evento antes da revisão do usuário. Consentimentos são eventos granulares e compartilhamento/analytics permanecem desativados.
- Consequência: o mobile ganha uma base auditável e preparada para consumidores futuros sem alterar tabelas profissionais existentes nem quebrar o desktop. Trocar perguntas exige publicar uma nova versão, não mudar respostas antigas. A anamnese inicial está marcada `draft` quanto à revisão clínica e deve ser validada por profissional habilitado antes de ser tratada como protocolo clínico revisado. Migration e Edge Functions vivem no repositório irmão `onlyfit-supabase`.
