# Landing Page Premium Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Clienta AI landing page to a high-end cinematic aesthetic — gradient mesh background, glassmorphism, floating particles, improved scroll reveals, and a fixed scroll arrow — without changing any copy, i18n keys, or functionality.

**Architecture:** Pure CSS/JSX changes only. New CSS classes are added to `index.css`; `Landing.jsx` gets new background layer divs, upgraded stat cards, and a fixed scroll chevron component; `LandingFeatureShowcase.jsx` gets a dark background and glassmorphism card styles. No new npm dependencies.

**Tech Stack:** React, Tailwind CSS, vanilla CSS animations (`transform`/`opacity` only for GPU compositing), existing `useLandingReveal` IntersectionObserver hook.

---

## File Map

| File | Role |
|------|------|
| `frontend/src/index.css` | Add keyframes + new utility classes; patch existing classes |
| `frontend/src/pages/Landing.jsx` | Add mesh/orb/particle layers in hero; replace scroll arrow; add glassmorphism stat cards |
| `frontend/src/components/LandingFeatureShowcase.jsx` | Dark background + glassmorphism card treatment |

---

### Task 1: Add CSS keyframes and new utility classes

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add new keyframes block** after the existing `@keyframes glow-pulse` block (around line 71):

```css
@keyframes mesh-breathe {
  0%   { opacity: 0.75; }
  100% { opacity: 1; }
}
@keyframes orb-float {
  0%, 100% { transform: translate3d(0, 0px, 0); }
  50%       { transform: translate3d(20px, -28px, 0); }
}
@keyframes particle-float {
  0%, 100% { transform: translateY(0);    opacity: 0.5; }
  50%       { transform: translateY(-18px); opacity: 1; }
}
@keyframes chevron-flow {
  0%   { opacity: 0; transform: rotate(45deg) translate(-3px, -3px); }
  50%  { opacity: 1; }
  100% { opacity: 0; transform: rotate(45deg) translate(3px, 3px); }
}
```

- [ ] **Step 2: Add new utility classes** after the `@keyframes` block:

```css
/* Premium hero background — gradient mesh */
.landing-mesh-bg {
  background:
    radial-gradient(ellipse 65% 85% at 10% 55%, rgba(37,99,235,0.22) 0%, transparent 55%),
    radial-gradient(ellipse 55% 65% at 90% 15%, rgba(59,130,246,0.18) 0%, transparent 55%),
    radial-gradient(ellipse 50% 55% at 50% 100%, rgba(29,78,216,0.14) 0%, transparent 50%);
  animation: mesh-breathe 14s ease-in-out infinite alternate;
}

/* Floating orb base */
.landing-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  pointer-events: none;
  will-change: transform;
}
.landing-orb-1 {
  width: 500px; height: 500px;
  background: rgba(59,130,246,0.11);
  top: -120px; left: -100px;
  animation: orb-float 18s ease-in-out infinite;
}
.landing-orb-2 {
  width: 350px; height: 350px;
  background: rgba(37,99,235,0.09);
  bottom: -60px; right: -80px;
  animation: orb-float 22s ease-in-out infinite reverse;
}

/* Floating particles */
.landing-particle {
  position: absolute;
  width: 2px; height: 2px;
  background: rgba(96,165,250,0.55);
  border-radius: 50%;
  pointer-events: none;
  will-change: transform;
  animation: particle-float var(--particle-dur, 9s) ease-in-out infinite;
  animation-delay: var(--particle-delay, 0s);
}

/* Scroll chevron arrow */
.landing-scroll-chevron {
  width: 10px; height: 10px;
  border-right: 1.5px solid rgba(255,255,255,0.35);
  border-bottom: 1.5px solid rgba(255,255,255,0.35);
  transform: rotate(45deg);
  animation: chevron-flow 1.5s ease-in-out infinite;
}
.landing-scroll-chevron:nth-child(2) {
  animation-delay: 0.3s;
}

/* Glassmorphism stat card */
.landing-stat-card {
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.09);
  backdrop-filter: blur(14px);
  border-radius: 12px;
  padding: 9px 14px;
  font-size: 0.75rem;
  color: rgba(255,255,255,0.55);
}
.landing-stat-card strong {
  color: white;
  font-weight: 700;
}
.landing-stat-card .stat-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
}

/* Badge pulsing dot */
.landing-badge-dot {
  width: 6px; height: 6px;
  background: #60a5fa;
  border-radius: 50%;
  animation: landing-float 2s ease-in-out infinite;
}

/* Glassmorphism feature card (dark sections) */
.glass-feature-card {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 1rem;
  position: relative;
  overflow: hidden;
  transition: border-color 0.3s, background 0.3s;
}
.glass-feature-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(59,130,246,0.45), transparent);
  opacity: 0;
  transition: opacity 0.3s;
}
.glass-feature-card:hover {
  border-color: rgba(59,130,246,0.22);
  background: rgba(59,130,246,0.04);
}
.glass-feature-card:hover::before {
  opacity: 1;
}
```

- [ ] **Step 3: Patch existing classes**

Update `.landing-network-grid` background-size from `40px 40px` to `48px 48px`:

```css
.landing-network-grid {
  background-image: 
    radial-gradient(circle at 2px 2px, rgba(59, 130, 246, 0.15) 1px, transparent 0);
  background-size: 48px 48px;
}
```

Update `.landing-reveal` translateY from `1.2rem` to `1.5rem`:

```css
.landing-reveal {
  opacity: 0;
  transform: translateY(1.5rem);
  transition:
    opacity   0.85s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.85s cubic-bezier(0.22, 1, 0.36, 1);
}
```

Add stagger group support after the existing `.landing-reveal-stagger` block:

```css
/* Stagger siblings inside a reveal group */
.landing-reveal-group .landing-reveal:nth-child(1) { transition-delay: 0ms;   }
.landing-reveal-group .landing-reveal:nth-child(2) { transition-delay: 100ms; }
.landing-reveal-group .landing-reveal:nth-child(3) { transition-delay: 200ms; }
.landing-reveal-group .landing-reveal:nth-child(4) { transition-delay: 300ms; }
.landing-reveal-group .landing-reveal:nth-child(5) { transition-delay: 400ms; }
.landing-reveal-group .landing-reveal:nth-child(6) { transition-delay: 500ms; }
```

Also add to the `prefers-reduced-motion` block:

```css
@media (prefers-reduced-motion: reduce) {
  /* existing rules... */
  .landing-mesh-bg,
  .landing-orb,
  .landing-orb-1,
  .landing-orb-2,
  .landing-particle,
  .landing-scroll-chevron,
  .landing-badge-dot {
    animation: none;
  }
}
```

- [ ] **Step 4: Verify CSS file looks correct** — open `frontend/src/index.css` and confirm no duplicate class names or broken blocks.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add premium landing CSS — mesh, orbs, particles, glassmorphism, scroll chevron"
```

---

### Task 2: Upgrade the hero background layers in Landing.jsx

**Files:**
- Modify: `frontend/src/pages/Landing.jsx`

The hero `<section>` currently has these background layers as children:
- `<div className="landing-hero-bg absolute inset-0 ...">`
- `<NetworkBackground />`
- `<div className="landing-network-grid absolute inset-0 ...">`
- `<div className="landing-grain ...">`
- `<div className="pointer-events-none absolute -left-1/4 ...">` (single orb)

Replace all of these with the new multi-layer system.

- [ ] **Step 1: Replace the background layer block inside the hero `<section>`**

Find this block (lines ~367–386 in `Landing.jsx`):
```jsx
<div
  className="landing-hero-bg absolute inset-0 will-change-transform"
  style={{ transform: `translate3d(0, ${heroParallaxY * 0.4}px, 0)` }}
  aria-hidden
/>
<NetworkBackground />
<div
  className="landing-network-grid absolute inset-0 opacity-10"
  aria-hidden
/>
<div
  className="landing-grain pointer-events-none absolute inset-0 will-change-transform"
  style={{ transform: `translate3d(0, ${heroParallaxY * 0.25}px, 0)` }}
  aria-hidden
/>
<div
  className="pointer-events-none absolute -left-1/4 top-1/3 h-[min(80vw,520px)] w-[min(80vw,520px)] rounded-full bg-brand-500/15 blur-3xl will-change-transform"
  style={{ transform: `translate3d(0, ${heroParallaxY * 0.5}px, 0)` }}
  aria-hidden
/>
```

Replace with:
```jsx
{/* Base gradient + mesh */}
<div className="landing-hero-bg absolute inset-0" aria-hidden />
<div className="landing-mesh-bg absolute inset-0" aria-hidden />

{/* Tech grid */}
<div className="landing-network-grid absolute inset-0 opacity-10" aria-hidden />

{/* Film grain */}
<div className="landing-grain pointer-events-none absolute inset-0" aria-hidden />

{/* Floating orbs */}
<div className="landing-orb landing-orb-1" aria-hidden />
<div className="landing-orb landing-orb-2" aria-hidden />

{/* Floating particles */}
{[
  { top: '18%', left: '12%', dur: '9s',  delay: '0s'   },
  { top: '42%', left: '72%', dur: '11s', delay: '2s'   },
  { top: '68%', left: '28%', dur: '8s',  delay: '4s'   },
  { top: '28%', left: '52%', dur: '13s', delay: '1.5s' },
  { top: '78%', left: '82%', dur: '10s', delay: '3s'   },
  { top: '55%', left: '8%',  dur: '12s', delay: '5s'   },
].map((p, i) => (
  <div
    key={i}
    className="landing-particle"
    style={{
      top: p.top, left: p.left,
      '--particle-dur': p.dur,
      '--particle-delay': p.delay,
    }}
    aria-hidden
  />
))}
```

- [ ] **Step 2: Remove the `NetworkBackground` component** — delete the entire `NetworkBackground` function definition (lines ~51–101) since it's replaced by the new CSS layers.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Landing.jsx
git commit -m "feat: replace hero background with gradient mesh, orbs, and particle system"
```

---

### Task 3: Upgrade the hero badge with pulsing dot

**Files:**
- Modify: `frontend/src/pages/Landing.jsx`

- [ ] **Step 1: Find the badge `<p>` element** in the hero text column (around line 389):

```jsx
<p className="landing-reveal text-xs font-semibold uppercase tracking-[0.4em] text-brand-300/80 drop-shadow-md sm:text-sm">
  {t('landing.hero.badge')}
</p>
```

Replace with a pill badge that includes the pulsing dot:

```jsx
<div className="landing-reveal inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-4 py-1.5 backdrop-blur-sm">
  <span className="landing-badge-dot" aria-hidden />
  <span className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-300/90 sm:text-sm">
    {t('landing.hero.badge')}
  </span>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Landing.jsx
git commit -m "feat: upgrade hero badge to glassmorphism pill with pulsing dot"
```

---

### Task 4: Add glassmorphism stat cards below hero CTAs

**Files:**
- Modify: `frontend/src/pages/Landing.jsx`

- [ ] **Step 1: Find the WhatsApp hint link** in the hero text column (around line 419–427):

```jsx
<a
  href={BUSINESS_WHATSAPP_URL}
  target="_blank"
  rel="noopener noreferrer"
  className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-white/50 transition-all duration-300 hover:text-white hover:gap-3"
>
  <WhatsAppGlyph className="h-4 w-4 opacity-80" />
  Chatea con nosotros por WhatsApp
</a>
```

Add the stat cards block **after** this `<a>` element (still inside the same `<div>` flex container):

```jsx
{/* Glassmorphism stat cards */}
<div className="flex flex-wrap items-center gap-3 landing-reveal">
  <div className="landing-stat-card">
    <span className="stat-dot" aria-hidden />
    <strong>3×</strong> {t('landing.hero.statConversions', '+ conversiones')}
  </div>
  <div className="landing-stat-card">
    <span className="stat-dot" aria-hidden />
    <strong>100%</strong> {t('landing.hero.statWhatsapp', 'WhatsApp oficial')}
  </div>
</div>
```

> **Note on i18n keys:** `landing.hero.statConversions` and `landing.hero.statWhatsapp` are new keys. The second argument to `t()` is a fallback string — if the keys are not yet in the translation files the fallback will show. Add them to the translation files at the end of Task 4.

- [ ] **Step 2: Add i18n keys to both translation files**

Find the translation files:
```bash
find /Users/david/Documents/Code/crm_ai/frontend/src -name "*.json" | grep -i i18n | head -10
# or
find /Users/david/Documents/Code/crm_ai/frontend -name "en.json" -o -name "es.json" | head -10
```

In the English translation file, inside `landing.hero`, add:
```json
"statConversions": "more conversions",
"statWhatsapp": "official WhatsApp"
```

In the Spanish translation file, inside `landing.hero`, add:
```json
"statConversions": "más conversiones",
"statWhatsapp": "WhatsApp oficial"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Landing.jsx
git add frontend/src -name "*.json"
git commit -m "feat: add glassmorphism stat cards to hero and i18n keys"
```

---

### Task 5: Fix the scroll arrow

**Files:**
- Modify: `frontend/src/pages/Landing.jsx`

- [ ] **Step 1: Find the scroll button** at the bottom of the hero section (around line 440–448):

```jsx
<button
  type="button"
  onClick={scrollToContent}
  className="col-span-full mx-auto mt-4 flex flex-col items-center gap-2 text-xs font-medium uppercase tracking-widest text-white/50 transition-colors hover:text-white/80 lg:mt-0"
  aria-label="Scroll to content"
>
  <span className="hidden sm:inline">Scroll</span>
  <ChevronDown className="h-6 w-6 animate-bounce" strokeWidth={1.5} />
</button>
```

Replace with the two-chevron waterfall arrow:

```jsx
<button
  type="button"
  onClick={scrollToContent}
  className="col-span-full mx-auto mt-4 flex flex-col items-center gap-2 text-xs font-medium uppercase tracking-widest text-white/30 transition-colors hover:text-white/60 lg:mt-0"
  aria-label="Scroll to content"
>
  <span className="hidden sm:inline">Scroll</span>
  <span className="flex flex-col items-center gap-0.5" aria-hidden>
    <span className="landing-scroll-chevron" />
    <span className="landing-scroll-chevron" />
  </span>
</button>
```

- [ ] **Step 2: Remove the `ChevronDown` import** if it is no longer used anywhere else in `Landing.jsx`. Check with:

```bash
grep -n "ChevronDown" /Users/david/Documents/Code/crm_ai/frontend/src/pages/Landing.jsx
```

If the only occurrence was the one you just replaced, remove it from the import at line 6:
```jsx
// Remove ChevronDown from the lucide-react import
import {
  Package, MessageSquare, BarChart3, Users, ShoppingCart,
  Check, ShieldCheck, Globe, Layers, Sparkles, Share2,
  Megaphone, Target, Zap, Home,
} from 'lucide-react';
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Landing.jsx
git commit -m "fix: replace bounce scroll arrow with animated dual-chevron waterfall"
```

---

### Task 6: Upgrade LandingFeatureShowcase to dark glassmorphism

**Files:**
- Modify: `frontend/src/components/LandingFeatureShowcase.jsx`
- Modify: `frontend/src/pages/Landing.jsx` (wrapper div)

The showcase is wrapped in a `<div>` in `Landing.jsx` (around line 452–454):
```jsx
<div className="bg-slate-50 border-t border-gray-100 dot-pattern-dark">
  <LandingFeatureShowcase t={t} featureIcons={FEATURE_ICONS} />
</div>
```

- [ ] **Step 1: Update the wrapper div in `Landing.jsx`** to use the dark background:

```jsx
<div className="bg-[#020617] border-t border-white/5">
  <LandingFeatureShowcase t={t} featureIcons={FEATURE_ICONS} />
</div>
```

- [ ] **Step 2: Update the `<section>` in `LandingFeatureShowcase.jsx`** — change the border color (line 68):

```jsx
<section
  ref={sectionRef}
  className="border-t border-white/5 py-10 md:py-14"
  aria-labelledby="offers-heading"
  onTouchStart={onTouchStart}
  onTouchEnd={onTouchEnd}
>
```

- [ ] **Step 3: Update the heading and subtitle text colors** (lines 74–84):

```jsx
<div className="landing-reveal text-center">
  <h2
    id="offers-heading"
    className="font-landing-serif text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-[2.75rem] lg:leading-tight"
  >
    {t('landing.offers.title')}
  </h2>
  <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-400 md:text-xl">
    {t('landing.offers.subtitle')}
  </p>
</div>
```

- [ ] **Step 4: Update the carousel card** to use glassmorphism (line 104):

```jsx
<div className="glass-feature-card overflow-hidden md:mx-14 lg:mx-20">
```

- [ ] **Step 5: Update the slide article text colors** (lines 115–129):

```jsx
<article
  key={i}
  className="shrink-0 px-5 py-8 sm:px-8 sm:py-10 md:px-12 md:py-12 lg:px-16 lg:py-14"
  style={{ width: `${SLIDE_PCT}%` }}
  aria-hidden={i !== index}
>
  <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center md:min-h-[200px] lg:min-h-[230px]">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 border border-brand-500/20 text-brand-400 md:h-16 md:w-16 lg:h-18 lg:w-18">
      <Ic className="h-7 w-7 md:h-8 md:w-8 lg:h-9 lg:w-9" strokeWidth={1.5} />
    </div>
    <h3 className="mt-5 font-landing-serif text-xl font-semibold leading-snug text-white sm:text-2xl md:mt-6 md:text-3xl lg:text-[1.85rem]">
      {t(`landing.offers.feature${i}Title`)}
    </h3>
    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base md:mt-5 md:text-lg md:leading-relaxed lg:text-base lg:leading-relaxed">
      {t(`landing.offers.feature${i}Desc`)}
    </p>
  </div>
</article>
```

- [ ] **Step 6: Update the nav arrows** to dark glassmorphism style (lines 87–102):

```jsx
<button
  type="button"
  onClick={() => go(-1)}
  className="absolute left-0 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 backdrop-blur-sm transition-colors hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-400 md:flex lg:left-2 lg:h-14 lg:w-14"
  aria-label={t('landing.carousel.prev')}
>
  <ChevronLeft className="h-7 w-7" strokeWidth={1.75} />
</button>
<button
  type="button"
  onClick={() => go(1)}
  className="absolute right-0 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 backdrop-blur-sm transition-colors hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-400 md:flex lg:right-2 lg:h-14 lg:w-14"
  aria-label={t('landing.carousel.next')}
>
  <ChevronRight className="h-7 w-7" strokeWidth={1.75} />
</button>
```

- [ ] **Step 7: Update the dot/icon nav buttons** (lines 135–152):

```jsx
<div className="mt-10 flex flex-wrap items-center justify-center gap-2 md:mt-12">
  {FeatureIcons.map((Ic, i) => (
    <button
      key={i}
      type="button"
      onClick={() => setIndex(i)}
      className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-all sm:h-12 sm:w-12 ${
        i === index
          ? 'border-brand-500/50 bg-brand-500/15 text-brand-400 shadow-sm ring-2 ring-brand-500/20'
          : 'border-white/10 bg-white/5 text-white/30 hover:border-white/20 hover:bg-white/10 hover:text-white/60'
      }`}
      aria-label={t(`landing.offers.feature${i}Title`)}
      aria-current={i === index ? 'true' : undefined}
    >
      <Ic className="h-5 w-5" />
    </button>
  ))}
</div>
```

- [ ] **Step 8: Update the mobile dot tabs** (lines 154–168) — change inactive dot color:

```jsx
className={`h-2 rounded-full transition-all ${
  i === index ? 'w-8 bg-brand-500' : 'w-2 bg-white/20 hover:bg-white/40'
}`}
```

- [ ] **Step 9: Update the CTA button at the bottom** (lines 171–178):

```jsx
<div className="landing-reveal mt-10 text-center md:mt-12">
  <Link
    to="/signup"
    className="btn-primary px-12 py-4 text-lg"
  >
    {t('landing.hero.getStarted')}
  </Link>
</div>
```

This link is already dark-themed via `btn-primary` — no change needed. Just confirm it renders correctly.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/LandingFeatureShowcase.jsx frontend/src/pages/Landing.jsx
git commit -m "feat: upgrade feature showcase to dark glassmorphism theme"
```

---

### Task 7: Upgrade hero phone glow

**Files:**
- Modify: `frontend/src/pages/Landing.jsx`

- [ ] **Step 1: Find the phone glow wrapper** inside the hero right column (around line 432–438):

```jsx
<div className="relative">
  <div className="absolute -inset-20 bg-brand-500/15 rounded-full blur-[100px] landing-glow-pulse pointer-events-none" />
  <div className="relative z-10">
    <PhoneMockup t={t} />
  </div>
</div>
```

Replace with a larger, softer mesh-matched glow:

```jsx
<div className="relative">
  {/* Mesh-matched glow — larger radius, softer */}
  <div className="pointer-events-none absolute -inset-24 rounded-full bg-brand-600/12 blur-[110px] landing-glow-pulse" aria-hidden />
  <div className="pointer-events-none absolute -inset-10 rounded-full bg-brand-400/8 blur-[60px]" aria-hidden />
  <div className="relative z-10">
    <PhoneMockup t={t} />
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Landing.jsx
git commit -m "feat: soften phone glow to match gradient mesh"
```

---

### Task 8: Visual QA — run dev server and check all sections

**Files:** None — verification only.

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/david/Documents/Code/crm_ai/frontend && npm run dev
```

- [ ] **Step 2: Open the landing page** at `http://localhost:5173` (or whichever port Vite uses) and check:

  - [ ] Hero gradient mesh is visible (blue tones, no purple/teal)
  - [ ] Orbs float slowly — no jank
  - [ ] 6 particles float independently
  - [ ] Badge pill has pulsing blue dot
  - [ ] Stat cards appear below WhatsApp hint with glass effect
  - [ ] Scroll arrow shows two animated chevrons flowing downward (not a static chevron)
  - [ ] Feature showcase section has dark background matching hero
  - [ ] Feature carousel cards have dark glass style
  - [ ] Phone glow is soft and large
  - [ ] No layout breaks on mobile (resize to 375px)
  - [ ] Light sections (Contact, Pricing, Services, Trust, Footer) are unchanged

- [ ] **Step 3: Check reduced-motion** — open DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`. Confirm all animations stop and content is still fully visible.

- [ ] **Step 4: Fix any issues found**, then commit fixes.

- [ ] **Step 5: Final commit**

```bash
git add -p  # stage any QA fixes
git commit -m "fix: landing page QA — visual polish and reduced-motion fixes"
```
