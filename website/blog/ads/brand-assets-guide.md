# Brand Assets Guide — What to Upload to the Ad Generator

**Purpose:** every ad brief references these files by name. Upload them **once** to the ad generator's asset library, then pick from the "Assets" tab on any future ad — no re-uploading per post.

**Core principle:** Etapa ads are **typography-led, not photography-led**. Black background + Poppins headline + pink squiggle beats a stock photo every time. Do not upload Unsplash/Pexels images to the tool unless a specific brief explicitly calls for one.

---

## 1. Brand kit — upload these first (one-time)

All live in `website/blog/ads/_library/` in the repo (generate them once, upload to the ad tool's Assets library, reuse forever).

| Filename | What it is | Use for |
|---|---|---|
| `brand-squiggle-01.png` | Plain pink squiggle on true-black, centred, 9:16 | The default Image-ad "Image" slot. The default UGC "Image" slot. Avatar Media slot #1. |
| `brand-squiggle-etapa.png` | Squiggle + ETAPA wordmark below, centred, 9:16 | Reference slot for image ads. Avatar Media slot #2. |
| `brand-squiggle-tagline.png` | Squiggle + ETAPA wordmark + "train with purpose", 9:16 | Reference slot when you want the model to pick up the tagline lock-up. Avatar Media slot #3. |
| `brand-headline-poster.png` | True-black 9:16 tile with a sample Poppins-SemiBold headline ("Cycling, for people who weren't always cyclists.") and AI chip bottom-left | The gold-standard reference. Use in the "Reference" slot on **every** image ad — locks the model to the poster aesthetic. |
| `brand-icon-72.png` | The app icon (copy of `website/icon-72.png`) | Fallback Image slot for brand-intro posts. Avatar Media slot #4. |
| `brand-cta-card.png` | "Read the full guide →" CTA pill on black, 9:16 | End-card frame for UGC + Avatar videos. |

### How to generate these (one-time setup script)

These six brand-kit PNGs can be generated with a small Python script (PIL) reusing the Poppins fonts already in `node_modules/@expo-google-fonts/poppins/`. Pattern it on `assets/regen_splash.py` — same approach: black canvas, draw squiggle (copied from `assets/splash.png`), draw headline, draw AI chip, save 1080×1920 PNG.

If the brand-kit files don't exist yet, generate them **before** kicking off Phase 1 ad production. Without them, the briefs below still work but you'll have to hand-drag art on each attempt.

---

## 2. App screenshots (nice-to-have, not required for Phase 1)

If you have clean 9:16 screenshots of these screens, stash them in `_library/` too:

| Filename | Use for |
|---|---|
| `app-plan-overview.png` | Avatar Media B-roll on practical posts (gear, gears, nutrition, maintenance, first-month) |
| `app-coach-chat.png` | Avatar Media B-roll on posts that mention the AI coach |
| `app-week-view.png` | Avatar Media B-roll on habit/routine posts |

Phase 1 ships fine without these — substitute a second brand-kit card in the Media slot.

---

## 3. Avatars — the Etapa roster

The ad generator's avatar library is separate from your brand kit. From the roster visible in the tool, here's the Etapa mapping:

| Tool avatar | Etapa coach it best represents | Use on posts |
|---|---|---|
| **Chelsea** (Female, 35, recommended in the tool) | **Clara** — warm, patient, beginner-friendly | UGC: learn-cycling-as-an-adult, solo-cycling-as-a-woman, first-group-ride-anxiety, cycling-anxiety-traffic. Avatar: any beginner-skewed practical post. |
| **Dark-haired woman in activewear** (the second tile in the avatar picker) | **Sophie** — science-backed, no-fluff | UGC: women-cycling-barriers, cycling-gatekeeping. Avatar: nutrition, first-month. |
| **Man in long-sleeve grey** (third tile) | **Tom** — casual riding buddy | Avatar: how-to-use-bike-gears, beginner-bike-maintenance. UGC: cycling-routine-habit-building. |
| **Man with beard in grey t-shirt** (fourth tile) | **Lars** — direct, no-nonsense | Avatar: how-to-choose-first-bike, beginner-cycling-gear-essentials. |

Other Etapa coaches (Elena — race-day strategist; Matteo — chill but focused) don't have close matches in the visible tool roster — map them if/when additional avatars are unlocked.

**Rule of thumb:** for any post targeting women or beginners, pick a female avatar. For any post targeting "the basics" vibe, pick Chelsea.

---

## 4. Style anchors (what *not* to upload)

Do NOT upload:

- Stock photos of lycra-clad racers, pelotons, power meters, or climbs.
- Pinterest-style "motivational" cycling quotes on stock photography.
- Generic fitness / gym imagery.
- Screenshots of competitor apps.

Do upload:

- The six brand-kit cards above.
- The Etapa icon / splash variants.
- App screenshots of your own product (when available).
- Soft, human documentary photos **only** if a specific brief explicitly calls one out (rare — currently zero briefs require one).

---

## 5. Checklist before kicking off Phase 2/3

- [ ] All six `brand-*.png` files generated and saved in `website/blog/ads/_library/`
- [ ] All six uploaded to the ad tool's Assets library
- [ ] Avatar roster mapped in the tool to the Etapa coaches per section 3 above
- [ ] `brand-headline-poster.png` verified as a workable Reference anchor on one test run before producing 15+ ads
