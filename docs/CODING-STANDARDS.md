# CODING-STANDARDS.md

Regras de código limpo e simples. Meta: qualquer pessoa (ou IA) lê o arquivo e entende em segundos. Menos código, menos esperteza.

## Princípios

- **Simples vence esperto.** Se há uma forma óbvia e uma engenhosa, use a óbvia.
- **Menos é mais.** Não adicione abstração, camada, config ou dependência "para o futuro". Adicione quando o presente pedir.
- **Apague sem dó.** Código morto, comentado, `console.log`, import não usado, arquivo órfão → fora. Git guarda o histórico.
- **Consistência > preferência pessoal.** Escreva no estilo do arquivo vizinho.

## TypeScript

- `strict` ligado. **Zero `any`.** Se não sabe o tipo, use `unknown` e afine.
- Prefira `type`/interfaces explícitas nas fronteiras (props, retorno de hook, resposta do Supabase).
- Nada de `// @ts-ignore`. Se precisar, é sinal de modelagem errada — conserte a causa.
- Imports com alias `@/` (ex. `import { supabase } from '@/lib/supabase'`).
- `npm run build` roda o typecheck strict — ele tem que passar limpo.

## React

- Só componentes de função + hooks. Um componente por arquivo (o default export).
- Componente que passou de ~150 linhas ou tem muitos `if` visuais → quebre em subcomponentes.
- **Toda busca de dado é um hook `useX` com React Query.** Nunca `fetch` dentro de `useEffect`. Ver `docs/MESSAGING-AND-CACHE.md`.
- `useEffect` só para efeito colateral real (sincronizar com DOM/localStorage/subscription). Se está usando pra derivar estado, derive direto na render.
- Liste as dependências dos hooks corretamente. Não silencie o lint com comentário sem entender.
- Chaves de lista estáveis e reais (id do dado), nunca índice.

## Estilo / Tailwind

- **Só tokens de tema para cor** (`bg-surface`, `text-on-surface`, `border-outline`, `bg-primary`). Nunca `bg-[#...]`, `text-white`, `text-black`. Ver `docs/DESIGN-SYSTEM.md`.
- **Só tokens de tipografia** (`text-body`, `text-title`, `text-label`…). Nunca `text-[13px]` nem `font-bold`/`font-semibold` soltos (o peso já vem no token).
- `clsx` para classes condicionais, não template string manual.
- Sem CSS inline com cor. Sem arquivo `.css` novo por componente — Tailwind resolve.

## Nomes

- Componentes/arquivos de componente: `PascalCase.tsx`. Hooks: `useCamelCase.ts`. Utils/tipos: `camelCase.ts`.
- Nome diz o quê, não o como. `useFeed`, não `useFetchDataFromSupabase`.
- Booleanos com prefixo (`isLoading`, `hasAccess`, `canSubscribe`).
- Em português no domínio de produto quando ajudar a clareza; em inglês para termos técnicos consagrados. Não misture no mesmo identificador.

## Funções

- Uma função faz uma coisa. Early-return em vez de aninhar `if`.
- Evite mais de ~3 parâmetros posicionais — use um objeto de opções.
- Sem efeito colateral escondido: função que se chama `formatX` não dispara request.

## Erros

- Nada de `catch` vazio. Ou trate, ou propague. Estados de erro visíveis ao usuário via React Query.
- Não engula erro do Supabase — verifique `error` de toda chamada e trate.

## Comentários

- Comente o **porquê**, nunca o **o quê** (o código já diz o quê).
- Comentário que explica código óbvio é ruído — apague o comentário, não o código.

## Checklist rápido antes de commitar

- [ ] Sem `any`, sem `@ts-ignore`, sem `console.log`.
- [ ] Sem cor/fonte hardcoded.
- [ ] Sem import/arquivo/dep não usado.
- [ ] `npm run build` e `npm run lint` limpos.
