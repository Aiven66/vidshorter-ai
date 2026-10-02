---
name: Obsidian Gold Studio
colors:
  surface: '#121316'
  surface-dim: '#121316'
  surface-bright: '#38393c'
  surface-container-lowest: '#0d0e11'
  surface-container-low: '#1b1b1f'
  surface-container: '#1f1f23'
  surface-container-high: '#292a2d'
  surface-container-highest: '#343538'
  on-surface: '#e3e2e6'
  on-surface-variant: '#d2c5b0'
  inverse-surface: '#e3e2e6'
  inverse-on-surface: '#303034'
  outline: '#9b8f7c'
  outline-variant: '#4e4635'
  surface-tint: '#f0c04d'
  primary: '#ffe4af'
  on-primary: '#3f2e00'
  primary-container: '#f5c451'
  on-primary-container: '#6d5100'
  inverse-primary: '#785a00'
  secondary: '#f0c043'
  on-secondary: '#3e2e00'
  secondary-container: '#b48b03'
  on-secondary-container: '#362800'
  tertiary: '#ede2ff'
  on-tertiary: '#3b0091'
  tertiary-container: '#d4c1ff'
  on-tertiary-container: '#632fcd'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdf9d'
  primary-fixed-dim: '#f0c04d'
  on-primary-fixed: '#251a00'
  on-primary-fixed-variant: '#5b4300'
  secondary-fixed: '#ffdf98'
  secondary-fixed-dim: '#f0c043'
  on-secondary-fixed: '#251a00'
  on-secondary-fixed-variant: '#5a4300'
  tertiary-fixed: '#e9ddff'
  tertiary-fixed-dim: '#d0bcff'
  on-tertiary-fixed: '#23005c'
  on-tertiary-fixed-variant: '#5417bf'
  background: '#121316'
  on-background: '#e3e2e6'
  surface-variant: '#343538'
  surface-base: '#0C0D10'
  surface-raised: '#14161B'
  surface-overlay: '#1C1F26'
  gold-light: '#FFE79A'
  gold-dim: '#A37D1D'
  ai-cyan: '#38BDF8'
  text-primary: '#F8FAFC'
  text-secondary: '#94A3B8'
  text-tertiary: '#64748B'
  border-glass: rgba(255, 255, 255, 0.08)
  border-glass-gold: rgba(245, 196, 81, 0.25)
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
  space-2xl: 4rem
---

## Brand & Style

This design system synthesizes Apple's precision-engineered minimalism with the opulence of high-end cinematic software. Designed for world-class digital creators, video artists, and AI prompt directors, the visual language balances understated technical capability with luxurious restraint.

### Visual Architecture & Mood
- **Black-Gold (黑金) Elegance:** Anchored in warm obsidian canvases and liquid champagne metallic highlights, evoking the weight and prestige of fine watchmaking and bespoke camera hardware.
- **Controlled Glassmorphism:** Translucent surfaces, sub-pixel optical perimeter borders, and deep optical blurs create structured, dimensional stacking without visual clutter.
- **AI Radiance:** Restrained micro-glows of electric violet and atmospheric cyan emerge dynamically across active states and processing indicators, symbolizing pure computational intelligence.

## Colors

The palette revolves around deep obsidian darkness illuminated by metallic champagne light.

### Color Roles & Application
- **Obsidian Neutrals:** `#0C0D10` grounds full-bleed workspace backdrops, while `#14161B` and `#1C1F26` establish structural elevation for tool panels, sidebars, and overlays.
- **Champagne Gold Core:** `#F5C451` acts as the primary focal driver for generation triggers, pro status markers, and timeline playheads. `#DFB135` and `#FFE79A` supply dimension for linear gradient highlights and active states.
- **AI Neural Accents:** Violet (`#8A5CF6`) and Cyan (`#38BDF8`) are reserved strictly for machine intelligence states: rendering pipelines, semantic selection brackets, and neural upscaling badges.
- **Text & Contrast:** Ultra-crisp `#F8FAFC` handles primary hierarchy, backed by `#94A3B8` for secondary descriptions and metadata to preserve calm visual focus.

## Typography

Typography prioritizes pristine rendering, geometric neutrality, and high-density readability.

### Type Architecture
- **Font System:** `Inter` handles all display, interface, and numerical functions, mimicking the optical neutrality and legibility of Apple's SF Pro.
- **Micro Tracking:** Tight negative tracking on display and headline weights creates a locked-in, architectural feel. Small captions and metric labels employ slight positive tracking (`+0.01em` to `+0.04em`) to ensure legibility on dark glass surfaces.
- **Tabular Figures:** Timecode markers, frame counters, and computational credit balances utilize tabular lining figures (`font-variant-numeric: tabular-nums`) to prevent horizontal jitter during real-time generation previews.

## Layout & Spacing

The structural layout uses an asymmetrical, studio-grade application architecture pairing a collapsible slim dock navigation with a fluid creative canvas.

### Layout Mechanics
- **Collapsible Control Dock:** A sleek left-hand rail (64px collapsed, 240px expanded) with micro-dampened transitions retains maximum viewport space for the generative workspace and viewport canvas.
- **Workspace Grid:** A dynamic 12-column layout handles asset libraries and template browsers, shifting down to single-column tool stacks on mobile devices.
- **Spacing Cadence:** Vertical rhythm scales on a strict 8pt baseline. Studio panels utilize `space-md` (16px) internal padding, while inspector drawers drop down to `space-sm` (8px) gaps to ensure high-density tool availability without cognitive overload.

## Elevation & Depth

Visual hierarchy uses physical material simulation: frosted dark sapphire glass, refractive optical edges, and directional radiance.

### Material Architecture
- **Glassmorphic Baselines:** Surface panels feature deep frosted glass execution (`backdrop-filter: blur(20px) saturate(180%)`), layered over `#0C0D10` with semi-translucent fill (`rgba(20, 22, 27, 0.75)`).
- **Hairline Perimeter Borders:** Elevation is signaled not by heavy drop shadows, but through 1px inner and perimeter hair lines: `rgba(255, 255, 255, 0.08)` for dormant panels, shifting to `rgba(245, 196, 81, 0.25)` when active.
- **Ambient Radiant Casts:** Focused interactive modules emit hyper-diffused, 40px to 80px radius back-glows (`rgba(245, 196, 81, 0.08)` for premium features; `rgba(138, 92, 246, 0.12)` for real-time generative models).
- **Z-Index Layering:**
  - `Layer 0`: Deep obsidian canvas `#0C0D10`
  - `Layer 1`: Media display tiles and grid groupings (`#14161B` with 1px border)
  - `Layer 2`: Floating floating toolbars, floating glass docks, and floating inspector cards
  - `Layer 3`: Modal render queues and export previews with background dimming (`rgba(0, 0, 0, 0.7)`)

## Shapes

The interface embraces a continuous fluid curvature inspired by hardware aesthetics.

### Geometry & Curvature
- **Full Pill Profiles:** Global CTAs, tag filters, search inputs, and status badges utilize complete pill radii (`roundedness: 3` / `9999px`) to produce smooth, touchable surfaces.
- **Hardware Corner Radii:** Video viewport containers, media preview cells, and studio panel cards employ gentle continuous curvature (`rounded-xl` / 24px) paired with 1px inset highlights that mimic precision CNC-milled aluminum hardware.

## Components

### Buttons & Action Bars
- **Primary Studio CTA:** Pill-shaped, coated in champagne gold gradient (`linear-gradient(135deg, #FFE79A 0%, #F5C451 50%, #DFB135 100%)`). Black label text (`#0C0D10`) with `fontWeight: 600`. Surrounded by a 1px exterior ring with 15% gold radiance on hover.
- **Secondary Glass Action:** Dark frosted pill (`rgba(255, 255, 255, 0.05)`), hairline border (`rgba(255, 255, 255, 0.1)`), transitioning to `rgba(255, 255, 255, 0.1)` with subtle scale reduction (`0.98`) upon click.
- **AI Neural Trigger:** Pill-shaped with dark violet background and dual-glow cyan border highlight (`border: 1px solid rgba(56, 189, 248, 0.4)`), displaying pulsating micro-sparkle icons.

### Inputs & Prompt Fields
- **Prompt Canvas Box:** Expansive, frosted obsidian enclosure (`#14161B` at 80% opacity, 20px blur). Inset border of `rgba(255, 255, 255, 0.08)`. When focused, border transitions smoothly to luminous champagne gold with a 12px ambient outer glow (`rgba(245, 196, 81, 0.15)`).
- **Inline Steppers & Sliders:** Sleek horizontal gold track (`#F5C451`) over dark obsidian trough, fitted with a 14px solid circular gold thumb featuring an inner white core reflection.

### Cards & Media Cells
- **Studio Video Tiles:** Aspect-ratio locked containers framed by a 1px border (`rgba(255, 255, 255, 0.06)`). Hover triggers reveal a champagne border shimmer and an overhead frosted glass overlay detailing prompt parameters, duration, and AI model telemetry.
- **Credit Balance Pill:** Small glass capsule displaying numeric values with a micro gold coin badge and tabular gold typography (`#FFE79A`).

### Navigation & Menus
- **Collapsible Studio Rail:** Vertical dock aligned to the left canvas. Icons sit in 36x36px optical hitboxes. Active items feature a vertical champagne accent bar (2px width) on the inner edge and an ambient gold glow behind the icon.
- **Dropdown Menus & Popovers:** Frosted obsidian base (`#14161B`, blur 24px), framed with crisp hairline borders, offering tactile menu options with rounded-lg selection pills upon hover.