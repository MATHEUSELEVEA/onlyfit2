# DESIGN-SYSTEM.md

O padrão visual do OnlyFit. A **referência de estrutura** deste design system é o tema **Azul — "Aura Precision"** (`docs/temas/DESIGN AZUL.md`): estética "Cool Tech", clara, respirável, premium, de alta precisão. Mas o app é **multi-tema**: o usuário escolhe entre **Preto**, **Azul** e **Laranja** em runtime, e o layout é o mesmo — **só a paleta de cor muda**.

## Regra de ouro

**Componente nunca conhece cor nem fonte concreta.** Ele usa *tokens*. Quem resolve o token para um valor real é o tema ativo. É isso que permite trocar de tema sem tocar em componente.

- ❌ `bg-[#6C5CE7]`, `text-white`, `style={{ color: '#131B2E' }}`, `text-[13px]`, `font-bold`
- ✅ `bg-primary`, `text-on-surface`, `text-body`, `text-label`

## Como o tema funciona (multi-tema)

1. Cada tema é especificado em `docs/temas/DESIGN {PRETO,AZUL,LARANJA}.md` (fonte da verdade da paleta).
2. Essas specs viram variáveis CSS em `src/theme/themes.css`, em **triplas RGB** por `data-theme` — ex. `--color-primary: 83 65 205;` — para suportar opacidade do Tailwind (`bg-primary/80`).
3. `tailwind.config.ts` mapeia cada token para `rgb(var(--color-<token>) / <alpha-value>)`.
4. `src/theme/ThemeProvider.tsx` guarda o tema escolhido em `localStorage` (`onlyfit.theme`) e aplica `data-theme` no `<html>`.
5. O usuário troca em **Perfil → Tema do aplicativo**. Padrão: **preto**.

Temas disponíveis (de `ThemeProvider.tsx`):

| id | Nome | Referência |
|---|---|---|
| `preto` | Premium Performance (padrão) | `docs/temas/DESIGN PRETO.md` |
| `azul` | Aura Precision | `docs/temas/DESIGN AZUL.md` |
| `laranja` | Editorial | `docs/temas/DESIGN LARANJA.md` |

### Adicionar um tema novo

1. Crie `docs/temas/DESIGN <COR>.md` com a mesma lista de tokens de cor dos existentes.
2. Adicione o bloco `[data-theme="<id>"] { --color-...: R G B; }` em `src/theme/themes.css` (triplas RGB, **todos** os tokens preenchidos).
3. Registre `{ id, label }` em `THEMES` no `ThemeProvider.tsx`.
4. Nada de tocar em componente. Se precisou, tem cor hardcoded escondida — conserte.

## Tokens de cor (papéis, não cores)

Use pelo papel semântico. Os mesmos tokens existem nos 3 temas com valores diferentes.

- **Superfícies:** `surface`, `surface-container`(-low/-high/-highest), `background`, `surface-variant`.
- **Conteúdo sobre superfície:** `on-surface`, `on-surface-variant`, `on-background`.
- **Ação / marca:** `primary`, `on-primary`, `primary-container`, `on-primary-container`.
- **Apoio:** `secondary`/`tertiary` (+ `on-*`, `*-container`).
- **Estado:** `error`, `on-error`, `error-container`.
- **Traços:** `outline`, `outline-variant`.

Regra prática: fundo de bloco = `surface`/`surface-container`; texto = `on-surface`; CTA = `bg-primary text-on-primary`; borda fina = `border-outline-variant`; erro = `text-error`.

## Tipografia (padrão TikTok — global, igual nos 3 temas)

Uma única família sans (Inter + fallback do sistema). Hierarquia por **peso e tamanho**, nunca por trocar de fonte. **Nunca `uppercase` nem `letter-spacing`** em texto de uso geral (botão, nav, corpo) — não é o estilo. Única exceção: `text-eyebrow` (cabeçalho de seção discreto, uppercase proposital).

> Nota: as specs em `docs/temas/` divergiam em fonte (Archivo Narrow, JetBrains Mono…). Isso foi **deliberadamente sobrescrito** pelo padrão TikTok abaixo. Do design de tema, aproveitamos **só a cor**.

| Token | Tamanho | Peso | Uso |
|---|---|---|---|
| `text-display` | 32px | 800 | Wordmark / telas de entrada |
| `text-title-lg` | 22px | 700 | Título de página |
| `text-title` | 17px | 700 | Título de seção / app bar |
| `text-handle` | 16px | 700 | @usuario sobre a mídia |
| `text-body` | 14px | 400 | Corpo principal |
| `text-body-sm` | 13px | 400 | Texto secundário/meta |
| `text-label` | 13px | 600 | Botões e pills |
| `text-counter` | 12px | 600 | Contadores de ação |
| `text-nav` | 10px | 500 | Tab bar inferior |
| `text-eyebrow` | 11px | 600 | Cabeçalho de seção (uppercase) |

Sempre `font-sans text-<token>`. O peso já vem no token — não some `font-bold`.

## Layout, forma e profundidade

- **Mobile-first.** Projete para a coluna estreita primeiro; o desktop é a exceção.
- **Ritmo de 4px** no espaçamento (escala `base/xs/sm/md/lg/xl`). Padding interno de card ~24px.
- **Cantos suaves:** inputs/botões pequenos `rounded` (~4px), cards `rounded-lg` (~8px), chips/tags `rounded-full`.
- **Profundidade por camada tonal e traço fino**, não sombra pesada. Card = superfície elevada + borda `outline-variant` de 1px. Sombra só sutil em hover/ativo.

## Componentes (padrão)

- **Botão primário:** `bg-primary text-on-primary`, sem borda, `rounded`, `text-label`.
- **Botão secundário:** fundo transparente, `text-on-surface`, `border border-outline`.
- **Input:** `bg-surface-container-lowest`, `border-outline-variant`; foco realça a borda com `primary`.
- **Card:** `bg-surface-container` + `border-outline-variant` (1px) + `rounded-lg`.
- **Chip/tag:** `rounded-full`, `text-eyebrow` ou `text-label`.

## Antes de considerar a UI pronta

- [ ] Trocar entre preto/azul/laranja não quebra nada nem some texto (contraste ok nos 3).
- [ ] Zero hex/`text-white`/`text-black`/tamanho arbitrário no diff.
- [ ] Layout íntegro em tela estreita (mobile-first).
