# Landing Page Premium Redesign

**Date:** 2026-04-29  
**Status:** Approved  
**Scope:** Visual and animation upgrade to `frontend/src/pages/Landing.jsx` and `frontend/src/index.css`

---

## Goal

Elevate the Clienta AI landing page from "plain" to high-end, inspired by nextsense.io's immersive cinematic aesthetic — smooth scroll-triggered reveals, large serif typography, and depth through layered backgrounds. Keep all existing structure, copy, i18n, and functionality intact.

---

## Design Direction

**Style:** Option C (Gradient Mesh + Glassmorphism) with Option A brand colors (deep navy `#020617` + brand blue `#3b82f6` / `#60a5fa`)

**Key aesthetic elements:**
- Layered gradient mesh background (brand blue hues only, no purple or teal)
- Film grain noise overlay (opacity ~0.032)
- Subtle tech grid (48px, brand blue at 5–6% opacity)
- Floating animated orbs (blur: 90px, slow float animation)
- Floating particles (6 dots, staggered float animations)
- Glassmorphism stat cards below hero CTAs
- Feature cards with top-edge shimmer line on hover
- Logo kept as `/main.png` in white pill container (unchanged)

---

## Hero Section

**Layout:** Two-column grid — text left, phone mockup right (unchanged from current)

**Text side:**
- Animated pill badge with pulsing blue dot (existing badge text, existing i18n key)
- Serif headline (`Cormorant Garamond`) with blue accent word, text-shadow glow
- Subtitle in `rgba(255,255,255,0.52)` 
- Primary + secondary CTA buttons (unchanged links/text)
- WhatsApp hint link (unchanged)
- Two glass stat cards: "3× más conversiones", "100% WhatsApp oficial"

**Phone side:**
- Keep existing `PhoneMockup` component exactly as-is
- Upgrade the glow: replace current `landing-glow-pulse` div with a larger, softer radial glow using the mesh color

**Scroll indicator (fixed):**
- Replace current single `ChevronDown` with two stacked animated chevrons
- Each chevron fades in and translates downward in sequence (waterfall animation)
- CSS-only, no JS

---

## Background System (CSS upgrades)

Replace/augment `.landing-hero-bg` with a new multi-layer system applied directly in the hero section:

1. **`.landing-mesh-bg`** — multi-stop `radial-gradient` using brand blues, slow breathe animation
2. **`.landing-grain`** — already exists, keep as-is  
3. **`.landing-network-grid`** — already exists, keep as-is (renamed background-size to 48px)
4. **`.landing-orb`** — two orbs, slow `translate` float animation (18s / 22s)
5. **`.landing-particle`** — 6 small dots with staggered `translateY` float

---

## Scroll Reveal Upgrades

Upgrade the existing `useLandingReveal` hook and `.landing-reveal` class:

- Increase `translateY` from `1.2rem` → `1.5rem`
- Add `transition-delay` staggering when multiple `.landing-reveal` siblings are inside a `.landing-reveal-group` container
- No change to the IntersectionObserver logic

---

## Feature Cards (LandingFeatureShowcase)

- Dark background (`#020617`) matching hero (currently `bg-slate-50`)
- Cards get the glassmorphism treatment: `rgba(255,255,255,0.025)` bg, subtle border, top shimmer line on hover
- Section eyebrow + title typography matches hero style

---

## Campaigns Section

Already dark — keep as-is. Minor: ensure tab pill active state uses brand blue glow (`shadow-brand-600/25`), which it already does.

---

## Contact, Services, Pricing, Trust Sections

- Keep all light sections (`bg-white`, `bg-slate-50`) unchanged — the contrast between dark hero and light content sections is intentional
- No structural changes to forms, pricing cards, or trust badges

---

## Footer

Unchanged.

---

## CSS Changes (index.css)

New classes to add:
- `.landing-mesh-bg` — gradient mesh
- `.landing-orb` — base orb style
- `.landing-particle` — base particle style  
- `.landing-scroll-chevron` — scroll arrow chevron
- `@keyframes mesh-breathe` — subtle opacity pulse
- `@keyframes orb-float` — slow translate float
- `@keyframes particle-float` — vertical float with opacity
- `@keyframes chevron-flow` — waterfall scroll arrow

Existing classes to update:
- `.landing-hero-bg` — keep but now supplemented by `.landing-mesh-bg`
- `.landing-network-grid` — update `background-size` to `48px 48px`
- `.landing-reveal` — increase `translateY` to `1.5rem`

---

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/index.css` | Add new keyframes and utility classes |
| `frontend/src/pages/Landing.jsx` | Upgrade hero background layers, scroll arrow, stat cards |
| `frontend/src/hooks/useLandingScroll.js` | Minor: add stagger group support |

**Do NOT change:**
- `frontend/src/components/LandingFeatureShowcase.jsx` (structure only, CSS classes will change)
- i18n translation files
- Any backend files
- Logo (`/main.png`)

---

## Constraints

- No new npm dependencies — all animations are CSS-only or use existing React state
- Must preserve all i18n (`useTranslation`) keys and calls
- Must preserve `prefers-reduced-motion` support (already in place)
- Performance: all new animations use `transform` and `opacity` only (GPU-composited)
- Mobile responsive — new background layers are `pointer-events: none` and don't affect layout
