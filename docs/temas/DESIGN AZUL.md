---
name: Aura Precision
colors:
  surface: '#f7f9fd'
  surface-dim: '#d8dade'
  surface-bright: '#f7f9fd'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f8'
  surface-container: '#eceef2'
  surface-container-high: '#e6e8ec'
  surface-container-highest: '#e0e3e6'
  on-surface: '#191c1f'
  on-surface-variant: '#474554'
  inverse-surface: '#2d3134'
  inverse-on-surface: '#eff1f5'
  outline: '#787586'
  outline-variant: '#c8c4d7'
  surface-tint: '#5847d2'
  primary: '#5341cd'
  on-primary: '#ffffff'
  primary-container: '#6c5ce7'
  on-primary-container: '#faf6ff'
  inverse-primary: '#c6bfff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#d8dff9'
  on-secondary-container: '#5a6278'
  tertiary: '#006647'
  on-tertiary: '#ffffff'
  tertiary-container: '#00825c'
  on-tertiary-container: '#e1ffed'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dfff'
  primary-fixed-dim: '#c6bfff'
  on-primary-fixed: '#160066'
  on-primary-fixed-variant: '#4029ba'
  secondary-fixed: '#dae2fc'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465b'
  tertiary-fixed: '#63fcc0'
  tertiary-fixed-dim: '#3fdfa5'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005138'
  background: '#f7f9fd'
  on-background: '#191c1f'
  surface-variant: '#e0e3e6'
typography:
  headline-xl:
    fontFamily: Archivo Narrow
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Archivo Narrow
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Archivo Narrow
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Archivo Narrow
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Archivo Narrow
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Archivo Narrow
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Archivo Narrow
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.02em
  label-xs:
    fontFamily: Archivo Narrow
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 20px
  margin: 24px
---

## Brand & Style

This design system is built for a "Cool Tech" fitness ecosystem, targeting data-driven athletes and performance-conscious users. The brand personality is clinical yet energetic—think high-end laboratory meets elite training facility. It prioritizes clarity, speed, and technical accuracy.

The visual style follows a **Corporate / Modern** aesthetic with **Minimalist** influences. By utilizing a high-contrast palette against "Ice White" surfaces, we achieve a look that feels breathable and premium. The interface uses subtle technical details—such as hairline strokes and monospaced-adjacent data displays—to reinforce a sense of precision and "Quantified Self" engineering.

## Colors

The palette is anchored by **Ice White** for base backgrounds, providing a cooler, more technical foundation than standard white. **Deep Navy** provides high-contrast legibility for all primary content and navigation, ensuring the interface feels grounded and professional.

**Electric Violet** is our high-energy catalyst; it is reserved exclusively for interactive elements and primary CTAs to signal action. **Mint Green** is used for success states and progress indicators, providing a vibrant, positive feedback loop. For premium features or ambassador-related content, **Rose Gold** acts as a sophisticated accent color.

- **Primary:** Electric Violet (#6C5CE7) - Action & Interaction.
- **Secondary:** Deep Navy (#131B2E) - Structure & Typography.
- **Success/Progress:** Mint Green (#00C48C) - Achievement & Growth.
- **Background:** Ice White (#F4F6FA) - Base Environment.
- **Surface:** Pure White (#FFFFFF) - Elevated Containers & Cards.

## Typography

The design system utilizes **Archivo Narrow** across all levels. This choice emphasizes the "Tech" aesthetic—the condensed proportions suggest data density and efficiency, reminiscent of telemetry displays and athletic timers.

Headlines should use tighter letter spacing to maintain a bold, impactful presence. Label styles, particularly at the `xs` level, should utilize uppercase transformation to act as technical metadata tags. Body copy is set with generous line height to ensure maximum readability against the light background.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** model with a strict 4px baseline rhythm. 

- **Desktop:** 12-column grid, 24px gutters, max-width of 1440px.
- **Tablet:** 8-column grid, 20px gutters.
- **Mobile:** 4-column grid, 16px gutters, 20px horizontal margins.

Content is organized into "Technical Modules"—defined card areas that use 24px (md) padding internally to maintain a spacious, premium feel. Larger vertical gaps (lg/xl) are used between distinct sections to prevent visual clutter and maintain the minimalist "Ice White" aesthetic.

## Elevation & Depth

This design system uses **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows. The goal is to feel light and "aerial."

1.  **Level 0 (Base):** Ice White (#F4F6FA).
2.  **Level 1 (Cards):** Pure White (#FFFFFF) with a 1px hairline border in a 10% opacity Deep Navy. This creates a subtle separation without the bulk of a shadow.
3.  **Active/Hover State:** A very soft, highly diffused Deep Navy shadow (Blur: 20px, Y: 4, Opacity: 4%) to indicate interactivity.
4.  **Overlays:** Semi-transparent Pure White backdrop blurs (20px blur) to maintain the "Cool Tech" atmosphere when modals are present.

## Shapes

The shape language is **Soft (0.25rem)**. This provides a balance between clinical precision and modern accessibility. While a 0px corner would feel too brutalist, the soft 4px radius keeps the UI feeling like a high-precision tool.

- **Buttons & Inputs:** 4px (Soft) corner radius.
- **Cards:** 8px (Rounded-lg) corner radius to soften the larger container presence.
- **Status Tags/Chips:** Full pill-shaped (rounded-full) to contrast against the more geometric structural elements.

## Components

### Buttons
- **Primary:** Electric Violet background with White text. No border. 4px radius.
- **Secondary:** Transparent background, Deep Navy text, and a 1px Deep Navy border.
- **Success:** Mint Green background, Deep Navy text (for high legibility).

### Input Fields
- **Default:** Pure White background, 1px Deep Navy (20% opacity) border. 
- **Focus:** 1px Electric Violet border with a 2px soft outer glow in Violet (20% opacity).

### Cards
- **Structure:** Pure White surface, 8px radius, 1px hairline border (#131B2E at 5% opacity).
- **Header:** Use Deep Navy for titles and Mint Green for any metric-based labels.

### Chips & Tags
- **Activity Tags:** Use the specific vertical colors provided (Bodybuilding: Red, Hyrox: Teal, etc.) as solid backgrounds with high-contrast text.
- **System Tags:** Pill-shaped, small uppercase labels (label-xs) using Deep Navy or Electric Violet.

### Progress Indicators
- **Style:** Linear bars using Mint Green (#00C48C) for the filled portion and a very light tint of the same color for the track. For high-tech "rings," use a 2px stroke width.