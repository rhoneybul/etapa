# Etapa — Design System

> Paste this file at the top of any Claude design chat. It gives Claude everything needed to produce on-brand visuals, components, pages, and copy.
>
> Extracted from the actual implemented patterns across `website/`, `admin-dashboard/`, `website/register-interest.js`, and the Holo-generated posts.
>
> Companion docs:
> - Voice & tone → [`BRAND.md`](./BRAND.md)
> - Strategy + content → [`STRATEGY.md`](./STRATEGY.md)

---

## 0. The one-sentence brief

**Dark-first, magenta-accented, editorial, confident, warm.** Think New York Times Magazine meets Apple product page, not SaaS landing page.

If a design feels busy, loud, or "Silicon Valley," it's off-brand. Calm wins.

---

## 1. Design tokens

### Colour

| Token | Hex | Usage |
|---|---|---|
| `etapa-primary` | `#E8458B` | Primary brand pink. THE magenta. Accents, CTAs, key emphasis. Always warm, never violet. |
| `etapa-primary-hover` | `#F472B6` | Hover state for primary. Lighter pink. |
| `etapa-primary-soft` | `rgba(232, 69, 139, 0.12)` | Magenta-tinted backgrounds (badges, callouts, hover fills). |
| `etapa-primary-border` | `rgba(232, 69, 139, 0.25)` | Magenta-tinted borders on soft backgrounds. |
| `etapa-bg` | `#000000` | Page background (true black, not charcoal). |
| `etapa-surface` | `#0a0a0a` | Card / surface background (slightly lifted black). |
| `etapa-surface-2` | `#111111` | Deeper surface for nested elements or form inputs. |
| `etapa-surface-3` | `#161616` | Tertiary surface (admin sidebar hover, code blocks). |
| `etapa-border` | `#1a1a1a` | Default subtle border (cards, divider lines). |
| `etapa-border-2` | `#232323` | Stronger border for inputs, modal edges. |
| `etapa-text` | `#ffffff` | Primary text on dark backgrounds. |
| `etapa-text-mid` | `#bbbbbb` | Body copy, long-form reading. |
| `etapa-text-muted` | `#888888` | Secondary text, labels, captions. |
| `etapa-text-faint` | `#555555` | Disabled, placeholder, tertiary. |
| `etapa-text-micro` | `#444444` | Footer text, legal disclaimers. |
| `etapa-accent-blue` | `#3B82F6` | Occasional secondary accent (launch banners, "coming soon" states). Use sparingly — never replaces magenta. |
| `etapa-success` | `#6EE7B7` | Success toasts, form confirmations. |
| `etapa-error` | `#F87171` | Errors, destructive actions. |

**Critical rule:** the primary magenta is pink, not purple. If any Claude-generated artifact shifts purple, manually override with `#E8458B`.

### Typography

- **Font family:** `Poppins` (Google Fonts)
- **Fallback stack:** `'Poppins', -apple-system, BlinkMacSystemFont, sans-serif`

| Role | Weight | Size (px) | Line-height | Letter-spacing |
|---|---|---|---|---|
| Hero h1 | 600 | clamp(44, 5.5vw, 76) | 1.05 | 0 |
| Section h2 | 600 | clamp(32, 4vw, 48) | 1.1 | 0 |
| Card h3 | 600 | 22-28 | 1.2 | 0 |
| Card h4 | 600 | 15-17 | 1.3 | 0 |
| Body default | 300 | 16-18 | 1.6-1.8 | 0 |
| Body small | 300 | 13-14 | 1.5-1.6 | 0 |
| Caption / muted | 300-400 | 12-13 | 1.5 | 0 |
| UI label (uppercase) | 600 | 10-12 | 1 | 0.5-1.5px |
| Button | 600 | 14-16 | 1 | 0 |

**Use weight 300 for body copy.** This is the single biggest brand-voice signal in typography — heavy body copy reads corporate, light body copy reads editorial.

### Spacing scale

```
4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 120
```

Use this scale. No arbitrary values.

**Most common patterns:**
- Card internal padding: `24-36px`
- Section vertical padding: `80-120px`
- Section horizontal padding: `24-48px` (responsive)
- Button padding: `10-14px × 20-32px`
- Gap between cards: `12-20px`

### Border radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | `8px` | Small inputs, chips inside cards |
| `radius-md` | `12px` | Standard input fields, code blocks |
| `radius-lg` | `16px` | Small cards, buttons, modals |
| `radius-xl` | `20px` | Standard cards, pricing tiles |
| `radius-2xl` | `24px` | Large cards, modal backdrops |
| `radius-pill` | `100px` | Buttons, badges, chips |
| `radius-full` | `50%` | Avatars, dots |

### Shadows

We lean **borders over shadows** for depth — black-on-black doesn't need heavy shadows. One exception:

- `shadow-modal` → `0 40px 80px rgba(0, 0, 0, 0.5)` (only on floating elements like the register-interest modal)

No other elements need shadows. Borders do the work.

### Motion

| Token | Value | Usage |
|---|---|---|
| `transition-fast` | `0.15s ease` | Hover state colour shifts |
| `transition` | `0.2s ease` | Button backgrounds, border colours |
| `transition-slow` | `0.3s ease` | Layout changes, accordion expand |

**Keyframes in use (from `website/index.html`):**

```css
@keyframes etapaPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.5; transform: scale(0.85); }
}
/* Use on small status dots — "Coming Soon", "Live", "New" indicators. */

@keyframes mcpSpin {
  to { transform: rotate(360deg); }
}
/* Use on inline loading spinners. */

@keyframes riFade {
  from { opacity: 0 } to { opacity: 1 }
}

@keyframes riSlide {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* Used by the register-interest modal backdrop + content. */
```

---

## 2. Components

Pattern inventory. Each component shows: usage rule + minimal code snippet. All code is the actual pattern used in `website/index.html`.

### 2.1 Button — Primary

Use for the main action on any page. One per hero, one per section. Never two primary buttons side-by-side.

**HTML/CSS:**
```html
<a href="#register-interest" class="btn-primary">
  Register Interest
</a>
```
```css
.btn-primary {
  display: inline-flex; align-items: center; gap: 10px;
  background: #E8458B; color: #000;
  font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 16px;
  padding: 16px 32px;
  border-radius: 100px;
  border: none; cursor: pointer;
  transition: all 0.2s; text-decoration: none;
}
.btn-primary:hover {
  background: #F472B6;
  transform: translateY(-1px);
}
```

**Tailwind:**
```tsx
<button className="inline-flex items-center gap-2.5 bg-etapa-primary text-black font-poppins font-semibold text-base px-8 py-4 rounded-full hover:bg-etapa-primary-hover hover:-translate-y-px transition-all">
  Register Interest
</button>
```

### 2.2 Button — Secondary / Ghost

Use for lower-emphasis actions (Learn More, Back, Cancel).

```css
.btn-secondary {
  background: transparent; color: #fff;
  border: 1px solid #333;
  font-weight: 500; padding: 16px 32px;
  border-radius: 100px;
  transition: all 0.2s;
}
.btn-secondary:hover {
  border-color: #555;
  background: rgba(255,255,255,0.04);
}
```

### 2.3 Button — Dark (default action in cards)

```css
.btn-default {
  background: #1a1a1a; color: #fff;
  border: 1px solid #333;
  padding: 14px 24px; border-radius: 100px;
  font-weight: 600;
}
.btn-default:hover { background: #222; border-color: #444; }
```

### 2.4 Badge / Pill

Use for labels, categories, "live" status, coming-soon tags.

```html
<div class="badge">
  <span class="badge-dot"></span>
  AI-Powered Training
</div>
```
```css
.badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(232, 69, 139, 0.12);
  border: 1px solid rgba(232, 69, 139, 0.25);
  border-radius: 100px;
  padding: 8px 18px;
  font-size: 14px; color: #E8458B; font-weight: 500;
}
.badge-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #E8458B;
}
```

**Variants** — same structure, swap colour:
- Neutral: `background: #0a0a0a; border: 1px solid #222; color: #bbb;`
- Blue (launch / coming soon): replace `232, 69, 139` with `37, 99, 235`

### 2.5 Card — Default

```css
.card {
  background: #0a0a0a;
  border: 1px solid #1a1a1a;
  border-radius: 20px;
  padding: 32px;
  transition: border-color 0.3s;
}
.card:hover { border-color: #2a2a2a; }
```

### 2.6 Card — Featured / Primary

Higher emphasis card (pricing hero, MCP section primary column).

```css
.card-featured {
  background: linear-gradient(180deg, rgba(232,69,139,0.06) 0%, #0a0a0a 60%);
  border: 1px solid rgba(232, 69, 139, 0.2);
  border-radius: 20px;
  padding: 36px;
}
```

### 2.7 Card — Interactive / Clickable

Used for the MCP demo prompt cards.

```css
.card-interactive {
  text-align: left;
  background: #0a0a0a;
  border: 1px solid #1a1a1a;
  border-radius: 16px;
  padding: 20px 22px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit; color: inherit;
}
.card-interactive:hover {
  background: #111;
  border-color: #E8458B;
}
```

### 2.8 Input — Text / Email

```css
.input {
  background: #111;
  border: 1px solid #232323;
  border-radius: 14px;
  padding: 14px 18px;
  font-family: 'Poppins', sans-serif;
  font-size: 15px; color: #fff;
  width: 100%;
  transition: border-color 0.2s, background 0.2s;
  box-sizing: border-box;
}
.input:focus {
  outline: none;
  border-color: #E8458B;
  background: #141414;
}
.input::placeholder { color: #555; }
```

### 2.9 Textarea

Same as input, plus:

```css
.textarea {
  min-height: 72px;
  line-height: 1.5;
  resize: vertical;
}
```

### 2.10 Modal

Pattern from `register-interest.js`.

```css
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  z-index: 9998;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: riFade 0.2s ease;
}
.modal {
  background: #0a0a0a;
  border: 1px solid #232323;
  border-radius: 24px;
  max-width: 480px; width: 100%;
  padding: 40px 32px 32px;
  box-shadow: 0 40px 80px rgba(0, 0, 0, 0.6);
  animation: riSlide 0.25s ease;
}
.modal-close {
  position: absolute; top: 16px; right: 16px;
  width: 36px; height: 36px; border-radius: 50%;
  background: #161616; border: 1px solid #232323;
  color: #bbb; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.modal-close:hover {
  background: #1e1e1e; color: #fff;
}
```

### 2.11 Nav bar

```html
<nav>
  <a href="/" class="nav-logo">
    <div class="nav-logo-icon"><img src="icon.png" alt="Etapa"></div>
    Etapa
  </a>
  <div class="nav-links">
    <a href="#how">How It Works</a>
    <a href="#features">Features</a>
    <a href="#register-interest" class="nav-cta">Register Interest</a>
  </div>
</nav>
```

```css
nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 48px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.nav-logo { display: flex; gap: 12px; font-weight: 600; font-size: 22px; }
.nav-links { display: flex; align-items: center; gap: 32px; }
.nav-links a { color: #999; font-size: 15px; transition: color 0.2s; }
.nav-links a:hover { color: #fff; }
.nav-cta {
  background: #E8458B !important; color: #000 !important;
  padding: 10px 24px; border-radius: 100px;
  font-weight: 600 !important;
}
```

### 2.12 Editorial text slide (Instagram post / launch hero)

This is the pattern Holo produced for Post 1 — the "Etapa opens the gate" graphic. Pure typography on black.

```html
<div class="editorial">
  <div class="editorial-label">New · Coming soon</div>
  <h1>Etapa opens<br><span>the gate.</span></h1>
  <p>Cycling coaching for real people.</p>
</div>
```

```css
.editorial {
  background: #000;
  padding: 80px 48px;
  text-align: center;
  min-height: 100vh;
  display: flex; flex-direction: column; justify-content: center;
}
.editorial-label {
  font-size: 12px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 1.2px;
  color: #E8458B;
  margin-bottom: 24px;
}
.editorial h1 {
  font-size: clamp(48px, 8vw, 120px); font-weight: 600;
  line-height: 1; margin-bottom: 32px; color: #fff;
}
.editorial h1 span { color: #E8458B; }
.editorial p {
  font-size: 18px; color: #aaa; font-weight: 300;
}
```

### 2.13 Section-level layout

```css
section {
  padding: 120px 48px;
  border-top: 1px solid #111;
  max-width: 1400px; margin: 0 auto;
}
section.section-header {
  text-align: center; margin-bottom: 80px;
}
```

### 2.14 Callout / quote box

```css
.callout {
  background: rgba(232, 69, 139, 0.08);
  border: 1px solid rgba(232, 69, 139, 0.2);
  border-radius: 16px;
  padding: 24px 28px;
  margin: 32px 0;
}
.callout-label {
  font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 1px;
  color: #E8458B;
  margin-bottom: 8px;
}
.callout p { color: #ddd; margin: 0; font-size: 15px; }
```

### 2.15 Pull quote

```css
.pull-quote {
  border-left: 3px solid #E8458B;
  padding-left: 24px;
  margin: 32px 0;
  font-size: 20px; font-weight: 500;
  color: #fff; line-height: 1.5;
  font-style: italic;
}
```

### 2.16 Checklist item (pricing features etc.)

```css
.features { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.features li {
  display: flex; align-items: center; gap: 10px;
  font-size: 14px; color: #999; font-weight: 300;
}
.features li::before {
  content: '✓';
  color: #E8458B; font-weight: 600; font-size: 14px;
}
```

---

## 3. Layout grid

- **Container max-width:** `1400px` (hero) · `1100px` (content sections) · `720px` (articles/blog)
- **Horizontal padding (responsive):** `48px` desktop → `24px` mobile (breakpoint: `1000px`)
- **Vertical section padding:** `120px` desktop → `80px` mobile

**Breakpoints:**
```css
/* Mobile-first default. Tablet + desktop overrides: */
@media (max-width: 1000px) { /* tablet */ }
@media (max-width: 600px)  { /* mobile */ }
```

---

## 4. Voice in UI (copy patterns)

This matters as much as visual. A perfectly-designed button with the wrong label is off-brand.

### Button labels — what to say

| Instead of | Use |
|---|---|
| Sign Up Now | Register Interest |
| Get Started | Start Riding / Learn More |
| Buy Now | Start 7-Day Free Trial |
| Subscribe | Start Your Plan |
| Learn More | How It Works |
| Download App | App Store Coming Soon / Get the App |
| Unlock Premium | See All Plans |

### Empty states

Gentle, never shameful. Examples from the admin dashboard:

- `No signups yet. Your first supporter is out there.`
- `No posts scheduled this week. Pick up where you left off.`
- `Nothing here yet. Come back after your first ride.`

### Error messages

Honest, specific, never patronising:

- `That email didn't go through. Try again or email us directly.`
- `Something's off on our end. We're looking into it.`

### Loading states

Never say "Please wait." Say what's actually happening:

- `Generating your plan…`
- `Asking the Etapa coach…`
- `Checking with Strava…`

### Tone tags (which parts of the UI are which)

| Surface | Tone |
|---|---|
| Marketing pages (website, landing) | Editorial, confident, warm |
| Onboarding flow | Encouraging, simple, celebratory ("nice work") |
| Coach chat | Friendly, like a friend texting |
| Admin dashboard | Neutral, factual, minimal |
| Error states | Honest, non-apologetic |
| Launch / "coming soon" | Quiet anticipation, not hype |

---

## 5. The "don't do this" list

Things that look like Etapa but aren't:

- ❌ Gradients between magenta and purple (the single biggest brand slippage)
- ❌ Drop shadows on cards (we use borders, not shadows)
- ❌ Green or orange anywhere (brand palette only)
- ❌ Emojis in product UI (zero tolerance)
- ❌ Neon / glowing effects
- ❌ Hero images of lycra-clad cyclists on mountains
- ❌ "Boxy" card layouts (everything has rounded corners ≥12px)
- ❌ White backgrounds (we are dark-first; light mode is not a v1 concern)
- ❌ Busy typography with multiple weights on one line
- ❌ More than one primary CTA per screen
- ❌ Body text above weight 400 (reads corporate)
- ❌ "Sign up" as a button label
- ❌ "Free trial!!" energy (exclamation marks are banned)

---

## 6. Paste-ready starters

### 6.1 For a new landing page

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Title] — Etapa</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Poppins', -apple-system, sans-serif;
      background: #000; color: #fff;
      overflow-x: hidden;
    }
    /* Pull in tokens + components from DESIGN_SYSTEM.md section 2 */
  </style>
</head>
<body>
  <!-- Nav (component 2.11) -->
  <!-- Hero (component 2.12 if text-led, else bespoke) -->
  <!-- Content sections (component 2.13) -->
  <!-- Footer -->
</body>
</html>
```

### 6.2 For a React component (Tailwind — matches admin-dashboard)

Tailwind classes to add to `tailwind.config.ts`:

```ts
theme: {
  extend: {
    colors: {
      'etapa-primary':      '#E8458B',
      'etapa-primary-hover':'#F472B6',
      'etapa-bg':           '#000000',
      'etapa-surface':      '#0a0a0a',
      'etapa-surface-2':    '#111111',
      'etapa-surface-3':    '#161616',
      'etapa-surface-light':'#1a1a1a',
      'etapa-border':       '#1a1a1a',
      'etapa-border-2':     '#232323',
      'etapa-text-mid':     '#bbbbbb',
      'etapa-text-muted':   '#888888',
      'etapa-text-faint':   '#555555',
    },
    fontFamily: {
      poppins: ['Poppins', 'sans-serif'],
    },
    borderRadius: {
      'pill': '100px',
    },
  },
},
```

### 6.3 For an Instagram post / slide

Use component 2.12 (Editorial text slide). Square (1080×1080) or vertical (1080×1920). True-black bg, magenta on the key word or underline.

### 6.4 For a new card module

Template:

```html
<div class="card">
  <div class="card-icon">
    <svg /* 22px, stroke #E8458B, strokeWidth 1.8 */></svg>
  </div>
  <h3>Title in 17px, weight 600</h3>
  <p>Body in 14px, weight 300, colour #777, line-height 1.6</p>
</div>
```

### 6.5 For a hero section

```html
<section class="hero">
  <div class="hero-content">
    <div class="badge">
      <div class="badge-dot"></div>
      Coming Soon
    </div>
    <h1>Headline in two lines.<br><span>Magenta accent on key word.</span></h1>
    <p class="hero-sub">One sentence of plain-English elaboration, max 18 words.</p>
    <div class="hero-buttons">
      <a href="#" class="btn-primary">Primary action</a>
      <a href="#" class="btn-secondary">Secondary</a>
    </div>
  </div>
</section>
```

---

## 7. How to use this file with Claude

**Pattern 1 — Design a new page:**
> *"Using the Etapa design system in DESIGN_SYSTEM.md, design a [referrals page / settings screen / email template] that [does X]. Use tokens from section 1, components from section 2, copy patterns from section 4."*

**Pattern 2 — Create a social graphic:**
> *"Using the Etapa design system, generate the HTML for an Instagram post (1080×1080) that says [X]. Use component 2.12 (editorial text slide)."*

**Pattern 3 — Rewrite UI copy:**
> *"Using section 4 of DESIGN_SYSTEM.md, rewrite these button labels and error messages to match Etapa's voice."*

**Pattern 4 — Audit an existing design:**
> *"Does this design violate any of section 5 of DESIGN_SYSTEM.md? Flag anything off-brand."*

---

## 8. Change log

- **2026-04-20** — First version. Extracted from `website/index.html`, `admin-dashboard/tailwind.config.ts`, `website/register-interest.js`. Includes tokens, 16 components, layout grid, voice patterns, don't-do list, and paste-ready starters.
