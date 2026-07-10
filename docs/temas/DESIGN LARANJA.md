---
name: Premium Performance Editorial
colors:
  surface: '#fcf9f0'
  surface-dim: '#dddad1'
  surface-bright: '#fcf9f0'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f3ea'
  surface-container: '#f1eee5'
  surface-container-high: '#ebe8df'
  surface-container-highest: '#e5e2da'
  on-surface: '#1c1c17'
  on-surface-variant: '#5b4138'
  inverse-surface: '#31312b'
  inverse-on-surface: '#f4f1e8'
  outline: '#8f7066'
  outline-variant: '#e3beb3'
  surface-tint: '#aa3600'
  primary: '#aa3600'
  on-primary: '#ffffff'
  primary-container: '#ff5e1a'
  on-primary-container: '#551700'
  inverse-primary: '#ffb59c'
  secondary: '#146c43'
  on-secondary: '#ffffff'
  secondary-container: '#9ff1bd'
  on-secondary-container: '#1b7047'
  tertiary: '#78582f'
  on-tertiary: '#ffffff'
  tertiary-container: '#b28d5f'
  on-tertiary-container: '#402703'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbcf'
  primary-fixed-dim: '#ffb59c'
  on-primary-fixed: '#390c00'
  on-primary-fixed-variant: '#822800'
  secondary-fixed: '#a2f4c0'
  secondary-fixed-dim: '#86d8a5'
  on-secondary-fixed: '#002110'
  on-secondary-fixed-variant: '#005230'
  tertiary-fixed: '#ffddb7'
  tertiary-fixed-dim: '#e9bf8d'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#5e411a'
  background: '#fcf9f0'
  on-background: '#1c1c17'
  surface-variant: '#e5e2da'
typography:
  display-lg:
    fontFamily: Archivo Narrow
    fontSize: 64px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Archivo Narrow
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Archivo Narrow
    fontSize: 32px
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
    lineHeight: '1.5'
  label-md:
    fontFamily: Archivo Narrow
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
spacing:
  base: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  max-width: 1280px
---

## Brand & Style
This design system shifts the narrative from raw mechanical performance to an elite, editorial sports aesthetic. It captures the spirit of high-end sports journalism—authoritative, sophisticated, and energetic. The brand personality is prestigious yet active, targeting high-performance athletes and enthusiasts who value both data and aesthetics.

The visual style is **Minimalist with Editorial High-Contrast**. It leverages the "Paper" background to create a tactile, printed-matter feel, while the "Carbon" typography provides a sharp, commanding presence. The "Whistle Orange" acts as a high-velocity accent, mimicking the intensity of live sports against a refined, composed backdrop.

## Colors
The palette is rooted in a "Paper" and "Carbon" foundation, ensuring maximum legibility and a premium editorial feel. 

- **Paper (#F7F6F3):** Used for all primary surfaces to reduce eye strain and provide a warm, sophisticated background.
- **Carbon (#14140F):** The primary color for typography and iconography, ensuring high contrast.
- **Whistle Orange (#FF5E1A):** Reserved for primary CTAs and critical status indicators to drive immediate attention.
- **Field Green (#146C43):** Utilized for success states, progress tracking, and achievement markers.
- **Steel (#6B6D75):** Used for structural elements like dividers, borders, and secondary metadata.
- **Bronze (#8C6A3F):** A specialized accent for premium tiers, ambassador status, and exclusive content.

## Typography
The typography system uses **Archivo Narrow** for headlines and labels to evoke the condensed, impactful look of sports headlines and data tables. **Inter** is used for body text to maintain exceptional legibility across long-form editorial content. 

Display styles should use tight letter spacing and a heavy weight to command the "Carbon" color. Labels are consistently uppercase with slight tracking (letter spacing) to enhance the structural, "Steel" feel of secondary information.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a rigorous 12-column structure for desktop. 

- **Desktop:** 12 columns, 24px gutters, 48px side margins.
- **Tablet:** 8 columns, 16px gutters, 32px side margins.
- **Mobile:** 4 columns, 16px gutters, 16px side margins.

The spacing rhythm is built on a 4px base unit, favoring generous vertical whitespace to allow the "Paper" background to "breathe," reinforcing the editorial look. Components should use internal padding that aligns with the 4px scale (e.g., 12px, 16px, 24px).

## Elevation & Depth
This design system avoids heavy drop shadows, instead using **Tonal Layers** and **Steel Outlines** to convey hierarchy. 

Depth is achieved by:
1. **Z-index Stacking:** Using slightly different shades of "Paper" (e.g., a 2% darker tint) for cards or secondary containers.
2. **Hairline Borders:** Using 1px "Steel" borders (#6B6D75) at 20-40% opacity to define container boundaries without adding visual bulk.
3. **High-Contrast Overlays:** Active states or modals use a "Carbon" overlay with 60% opacity to focus the user's attention, maintaining the stark, dramatic editorial contrast.

## Shapes
To maintain a professional, high-performance edge, the shape language is **Sharp**. 

Rectangular forms with 0px corner radii are used for buttons, input fields, and containers. This mimics the rigid lines of athletic tracks, field markings, and traditional newspaper columns. Small exceptions can be made for "Chips" or "Badges" which may use a subtle "Soft" (0.25rem) radius to differentiate them from functional buttons.

## Components
- **Buttons:** Primary buttons are "Whistle Orange" with "Paper" text, sharp-edged, and use Archivo Narrow Bold in uppercase. Secondary buttons use a "Carbon" border with "Carbon" text.
- **Cards:** Cards use the base "Paper" color but are defined by 1px "Steel" borders. They should have generous internal padding (min 24px).
- **Input Fields:** Bottom-border only or full "Steel" stroke. Labels sit above the field in uppercase "Label-md" style.
- **Chips/Badges:** Used for category tags. High-contrast "Carbon" background with "Paper" text for active states; "Steel" outlines for inactive states.
- **Lists:** Separated by 1px "Steel" dividers. Headlines within lists use "Carbon" and Archivo Narrow.
- **Progress Bars:** Use "Field Green" for the fill and a light "Steel" tint for the track to represent growth and achievement.
- **Premium Indicators:** Elements utilizing the "Bronze" color should include a small "Carbon" icon to denote exclusivity or Ambassador status.