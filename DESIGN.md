---
name: OnlyFit
description: Design system multi-tema do OnlyFit — acesso premium ao creator fitness
colors:
  # Tema padrão "preto" (Premium Performance). Fonte da verdade: src/theme/themes.css
  # (triplas RGB por data-theme). Os MESMOS tokens existem nos temas azul e laranja.
  primary: "#CAF300"
  on-primary: "#1E2600"
  primary-container: "#CAF300"
  on-primary-container: "#596C00"
  secondary: "#FFB79C"
  on-secondary: "#5E1700"
  tertiary: "#B2CAD7"
  on-tertiary: "#1B343D"
  error: "#FFB4AB"
  on-error: "#690005"
  surface: "#121315"
  surface-container-lowest: "#0D0E10"
  surface-container-low: "#1A1B1E"
  surface-container: "#1F2023"
  surface-container-high: "#292A2E"
  surface-container-highest: "#333438"
  on-surface: "#E6E7EA"
  on-surface-variant: "#B3B7C0"
  outline: "#80838C"
  outline-variant: "#3A3D43"
  background: "#121315"
  on-background: "#E6E7EA"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  full: "9999px"
  xl: "12px"
  2xl: "16px"
  sheet: "16px 16px 0 0"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    height: "36px"
  chip-unselected:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.full}"
    height: "36px"
---

# Design System: OnlyFit

## 1. Overview

**Creative North Star: "O Camarote"**

Acesso premium a quem você admira. A interface é a escuridão da arena que faz a luz cair no conteúdo: o creator é a estrela, o chrome recua. Exclusividade se sente pela contenção e precisão — nunca por dourado, brilho ou ornamento. Componentes são confiantes e diretos: formas sólidas, CTA em cor cheia, hierarquia por peso tipográfico.

O sistema é **multi-tema por tokens**: os papéis semânticos (`surface`, `on-surface`, `primary`…) são fixos; o tema ativo (`preto` padrão, `azul`, `laranja`) resolve o valor em runtime via `data-theme` no `<html>`. Componente nunca conhece cor concreta. Este documento rejeita explicitamente: cara de ERP fitness, SaaS azul-marinho de cards idênticos, poluição neon "viral" e o template genérico de IA.

**Key Characteristics:**
- Conteúdo em tela cheia; UI sobreposta, mínima e firme
- Multi-tema em runtime — tokens semânticos, zero cor hardcoded
- Uma família tipográfica (Inter), hierarquia só por peso/tamanho
- Pílulas (raio full) para toda ação; sem uppercase, sem letter-spacing
- Profundidade tonal (ramp de surface-containers), não sombra

## 2. Colors

Neutros frios e des-tingidos que fazem o acento brilhar como única voz quente da tela.

### Primary
- **Lime de Arena** (#CAF300 no tema preto): a única cor de ação. CTA (Seguir, Assinar), estado selecionado, indicador ativo. Nos outros temas o papel é o mesmo com outro valor (violeta #5341CD no azul, laranja queimado #AA3600 no laranja).

### Secondary
- **Pêssego de Apoio** (#FFB79C): apoio raro — realces que não são ação.

### Tertiary
- **Azul Névoa** (#B2CAD7): informação terciária, estados neutros.

### Neutral
- **Arena** (#121315, `surface`/`background`): o palco escuro padrão.
- **Ramp de containers** (#0D0E10 → #333438): profundidade tonal em 5 degraus; quanto mais alto o container, mais elevado o elemento.
- **Texto** (#E6E7EA `on-surface`; #B3B7C0 `on-surface-variant`): corpo e apoio, contraste AA nos 3 temas.
- **Traços** (#80838C `outline`; #3A3D43 `outline-variant`): bordas finas de 1px, geralmente com opacidade (`/30`).

### Named Rules
**The Token-Only Rule.** Cor concreta em componente é proibido — sempre `bg-primary`, `text-on-surface`, nunca hex/`text-white`. O tema troca em runtime; cor hardcoded quebra o produto. `npm run lint` e revisão barram violações.
**The One Voice Rule.** `primary` é a única cor de ação e cobre ≤10% da tela. Se duas cores competem por atenção, uma delas está errada.

## 3. Typography

**Body Font:** Inter (com system-ui fallback) — família única para tudo.

**Character:** Padrão TikTok: uma sans neutra, hierarquia inteira por peso e tamanho. Nada de segunda família, nada de itálico decorativo.

### Hierarchy
- **Display** (800, 32px, 1.15): wordmark e telas de entrada.
- **Headline** (`text-title-lg`, 700, 22px, 1.25): título de página.
- **Title** (700, 17px, 1.3): título de seção / app bar.
- **Body** (400, 14px, 1.45): corpo principal; `body-sm` 13px para apoio.
- **Label** (600, 13px, 1.2): botões e pills. Auxiliares: `handle` (700/16px), `counter` (600/12px), `nav` (500/10px), `eyebrow` (600/11px, única exceção uppercase permitida).

### Named Rules
**The No-Shouting Rule.** `uppercase` e `letter-spacing` são proibidos em texto de uso geral (botão, nav, corpo). Única exceção: `text-eyebrow`. `font-bold` solto e `text-[Npx]` arbitrário também são proibidos — só tokens.

## 4. Elevation

Sem sombras estruturais: profundidade é **tonal**, pelo ramp de `surface-container-*` (quanto mais alto, mais claro no tema preto). A única sombra permitida é a do BottomSheet (`shadow-2xl`) por estar fisicamente sobre o conteúdo.

### Named Rules
**The Tonal Depth Rule.** Elemento acima = container mais alto, nunca sombra. Se um card precisa de sombra para se destacar, o problema é hierarquia, não elevação.

## 5. Components

Confiantes e diretos: formas sólidas, cor cheia, sem enfeite.

### Buttons
- **Shape:** pílula (raio full), altura mínima 36px, toque ≥44px.
- **Primary:** `bg-primary text-on-primary` + `text-label`.
- **Hover / Focus:** transição de cor curta (`transition-colors`); foco visível por anel do próprio tema.
- **Secondary/Ghost:** `bg-primary/10 text-primary` ou só texto — nunca borda grossa.

### Chips (filtros)
- **Style:** pílula 36px, `text-label`.
- **State:** selecionado = `bg-primary text-on-primary`; não selecionado = `bg-surface-container text-on-surface-variant`.

### Cards / Containers
- **Corner Style:** `rounded-xl`/`rounded-2xl` (12–16px).
- **Background:** ramp `surface-container-*` conforme profundidade.
- **Border:** quando necessária, `border-outline-variant/30` (1px suave).
- **Shadow Strategy:** nenhuma (ver Elevation).

### Inputs / Fields
- **Style:** fundo `surface-container`, raio 12px, sem borda pesada.
- **Focus:** borda/anel na cor `primary`.
- **Error:** texto e traço em `error`.

### Navigation
- **BottomNav:** barra inferior fixa, ícone + `text-nav`; ativo em `primary`, inativo em `on-surface-variant`. Área segura via `pb-safe-bottom`.

### BottomSheet (assinatura da casa)
Painel deslizante de baixo, `rounded-t-2xl`, `border-t border-outline-variant/30`, fundo `background`, máx. 88% da altura. É o padrão para qualquer fluxo secundário (compartilhar, filtros, opções) — modal centrado é exceção.

## 6. Do's and Don'ts

### Do:
- **Do** usar exclusivamente tokens de cor e tipografia — o tema troca em runtime.
- **Do** dar ao conteúdo a tela inteira e sobrepor a UI com contenção.
- **Do** usar o ramp tonal de containers para profundidade.
- **Do** manter contraste AA (≥4.5:1) nos 3 temas ao propor cor nova.
- **Do** respeitar `prefers-reduced-motion` em qualquer animação.

### Don't:
- **Don't** usar cor ou fonte hardcoded (`#hex`, `text-white`, `text-[13px]`, `font-bold` solto).
- **Don't** parecer "app de academia genérico" (planilha, listas cinzas de ERP fitness) nem "SaaS corporativo frio" (azul-marinho, cards idênticos).
- **Don't** cair no "template de IA": hero com gradiente, eyebrow uppercase em toda seção, borda lateral colorida em card, gradient text, glassmorphism decorativo.
- **Don't** usar sombra para elevação (exceto BottomSheet) nem uppercase/letter-spacing fora de `text-eyebrow`.
- **Don't** poluir com badge/neon/gradiente — "rede social caótica" é anti-referência nomeada.
