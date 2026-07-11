---
name: Premium Performance
colors:
  surface: '#121315'
  surface-dim: '#121315'
  surface-bright: '#3a3b3f'
  surface-container-lowest: '#0d0e10'
  surface-container-low: '#1a1b1e'
  surface-container: '#1f2023'
  surface-container-high: '#292a2e'
  surface-container-highest: '#333438'
  on-surface: '#e6e7ea'
  on-surface-variant: '#b3b7c0'
  inverse-surface: '#e6e7ea'
  inverse-on-surface: '#2b2c30'
  outline: '#80838c'
  outline-variant: '#3a3d43'
  surface-tint: '#caf300'
  primary: '#ffffff'
  on-primary: '#1e2600'
  primary-container: '#caf300'
  on-primary-container: '#596c00'
  inverse-primary: '#536600'
  secondary: '#ffb79c'
  on-secondary: '#5e1700'
  secondary-container: '#4a271c'
  on-secondary-container: '#ffcdbc'
  tertiary: '#b2cad7'
  on-tertiary: '#1b343d'
  tertiary-container: '#29363d'
  on-tertiary-container: '#bedce9'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#caf300'
  primary-fixed-dim: '#b0d500'
  on-primary-fixed: '#171e00'
  on-primary-fixed-variant: '#3e4c00'
  secondary-fixed: '#ffdbd0'
  secondary-fixed-dim: '#ffb59e'
  on-secondary-fixed: '#3a0b00'
  on-secondary-fixed-variant: '#852400'
  tertiary-fixed: '#cde7f3'
  tertiary-fixed-dim: '#b1cad7'
  on-tertiary-fixed: '#041e28'
  on-tertiary-fixed-variant: '#324a54'
  background: '#121315'
  on-background: '#e6e7ea'
  surface-variant: '#2e2f33'
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
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Archivo Narrow
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Archivo Narrow
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 64px
---

## Brand & Style
The design system is engineered for an exclusive, high-performance fitness community. The brand personality is **Authoritative, Energetic, and Exclusive**, mirroring the intensity of a high-end, members-only gym. 

The aesthetic is **Dark-Themed Modernism** with **Glassmorphism** accents. It prioritizes high-quality, full-bleed fitness imagery and video content, using a deep charcoal foundation to make performance data and creator content "pop." The emotional response should be one of aspiration and focus—removing digital clutter to center on the physical result.

## Colors
The palette is built on a foundation of "absolute focus." 
- **Primary (Electric Lime):** Used for primary actions, success states, and active training indicators. It represents high energy and visibility.
- **Secondary (High-Vis Orange):** Reserved for urgent notifications, secondary CTA highlights, and intensity metrics (e.g., heart rate zones).
- **Surfaces:** A three-tier dark system (Background, Surface, Surface-Elevated) creates depth without breaking the dark-mode immersion. 
- **Accents:** Sophisticated grays provide contrast for secondary text and non-interactive UI elements.

## Typography
The typography strategy contrasts **Strength** with **Precision**. 
- **Headlines:** Uses a condensed, bold sans-serif to evoke the feeling of gym signage and editorial sports magazines. Uppercase styling is preferred for top-level headers to increase authority.
- **Body:** Inter provides a clean, neutral canvas for long-form descriptions and workout instructions.
- **Data Labels:** A monospaced font is used for technical data (reps, sets, timers) to ensure character alignment and a "technical gear" aesthetic.

## Layout & Spacing
The layout follows a **Fluid Grid** model with generous white space (or "black space") to maintain a premium feel.
- **Desktop:** 12-column grid with 24px gutters. Content is often centered in a max-width container (1280px) to prevent eye strain.
- **Mobile:** 4-column grid with 16px gutters and 20px side margins. 
- **Vertical Rhythm:** Built on an 8px base unit. Component internal padding should favor `md` (24px) for a breathable, high-end look.

## Elevation & Depth
Depth is achieved through **Tonal Layering** and **Glassmorphism** rather than traditional drop shadows.
- **Level 0 (Background):** Pure black (#0A0A0A) for the deepest layer.
- **Level 1 (Surface):** Dark charcoal (#161616) for main cards and feed items.
- **Level 2 (Overlays):** Semi-transparent surfaces (80% opacity) with a 20px backdrop blur and a thin `glass_stroke` (1px white at 15% opacity).
- **Interactions:** Hover states on cards should slightly brighten the surface color rather than adding shadow, maintaining the "light-from-within" look of high-end electronics.

## Shapes
This design system uses **Rounded** geometry (0.5rem base) to balance the aggressive typography with a modern, approachable software feel.
- **Buttons & Small Inputs:** 0.5rem (8px).
- **Cards & Containers:** 1rem (16px) to 1.5rem (24px) for a soft, premium container look.
- **Selection Indicators:** Pill-shaped (fully rounded) for toggles and status chips.

## Components
- **Buttons:** Primary buttons use the `primary_color` (Electric Lime) with black text for maximum contrast. Secondary buttons are "Ghost" style with a 1px white border at 20% opacity.
- **Feed Items:** Full-bleed imagery with a subtle bottom-to-top black gradient overlay. Content metadata (creator name, duration) sits on top of the gradient using `label-caps`.
- **Cards:** Use the `surface` color with a 1px `border_subtle`. On hover, the border opacity increases.
- **Input Fields:** Darker than the surface (#000000), 1px border. Focus state uses a `primary_color` glow (2px outer stroke).
- **Chips/Badges:** Small, high-contrast pills for "Live," "Premium," or "Pro" labels, using the `secondary_color` (Orange) for urgency.
- **Progress Indicators:** Use thin, 2px lines. Completed segments use `primary_color`; remaining segments use `surface_elevated`.