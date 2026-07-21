# ECOSYSTEM.md

Contexto de produto e de sistema. Serve para qualquer pessoa/IA entender **o que** o OnlyFit é e **onde este app se encaixa** antes de escrever código. Detalhe de UX de origem: `../outros docs/BASE_PARA_UX.md`.

## O produto

OnlyFit é o **"OnlyFans do fitness"**: plataforma B2C onde o usuário paga (assinatura recorrente ou compra avulsa) para ter acesso a criadores, treinadores e autoridades fitness — treino, dieta, comunidade, conteúdo exclusivo, lives, desafios e produtos digitais.

Quatro pilares integrados numa jornada só (não quatro apps):

1. **Assinatura recorrente** — acesso mensal a comunidades/conteúdo do creator.
2. **Marketplace** — venda de produtos digitais (treinos, e-books, dietas, programas).
3. **Comunidade** — feed, posts, lives, desafios, proximidade com o creator.
4. **Performance** — treino, nutrição, métricas, evolução.

Sensação-alvo da UX: **acesso premium, proximidade e pertencimento** a uma comunidade paga.

## Públicos

- **Cliente final:** descobre, segue, assina, compra, consome e acompanha a própria evolução.
- **Creator/profissional:** monetiza autoridade e conteúdo; a plataforma entrega app, pagamento, entrega de conteúdo, área de membros, marketplace e dados.

## Este app (OnlyFit v2)

Reescrita **limpa e mobile-first** do front, do zero, consumindo o **mesmo banco Supabase de produção do v1**. Objetivo: base enxuta e sustentável, sem a dívida do v1, sobre os dados reais que já existem.

- **v2 (aqui / `onlyfit-mobile`):** front novo, foco atual em feed + temas + auth, evoluindo para interações reais (curtir, seguir, assinar), venda no post e telas completas. Web primeiro, com app iOS via Capacitor em `ios/App` para empacotar o mesmo Vite build e manter abertura para plugins nativos.
- **v1 (`../onlyfit-original/`):** app legado, dono histórico do schema, das integrações de pagamento (Asaas: checkout, split, recorrência), motores de treino/nutrição, i18n e da vasta documentação em `onlyfit-original/docs/`.

## Fronteiras (o que é e o que NÃO é deste app)

- **Deste app:** UI, navegação, consumo do banco via SDK sob RLS, temas, experiência mobile.
- **NÃO deste app:** processar pagamento, calcular split/recorrência, decidir liberação de acesso pago, motores de treino/dieta. Isso vive no backend do ecossistema (funções, integrações Asaas, RLS). O front **reflete** estado, não decide dinheiro nem acesso. Ver `docs/SECURITY.md` e `docs/DATABASE.md`.

## Por que isso importa pra quem codifica

- Não reimplemente regra de negócio sensível no cliente por atalho — ela mora no banco/servidor.
- Como o banco é compartilhado com produção, mudança de dado/schema é **decisão de ecossistema**, registrada em `docs/DECISIONS.md`.
- Ao mexer numa feature, verifique se o v1 já resolveu algo equivalente antes de inventar.
