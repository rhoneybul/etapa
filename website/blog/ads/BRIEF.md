# Etapa — Instagram Ads Kickoff Brief

**Owner:** Rob
**Drafted:** 17 April 2026
**Run this from:** VSCode (so you have Firecrawl + Perplexity MCPs attached)
**Output folder:** `website/blog/ads/`

---

## 1. What you're making

An Instagram ad companion for **every blog post in `website/blog/`** (15 posts today). Each ad must:

- Link back to its specific blog post (with UTMs).
- Be openly, visibly AI-generated — transparency is a feature, not a disclaimer, because Etapa itself is an AI coaching product.
- Work as both a marketing asset and a standalone piece of useful content about the topic.

Three ad formats are in play (from the AI ad generator tool I'm using):

- **AI image ad** (static, 9:16)
- **UGC-style video** (AI-generated "real person" talking to camera)
- **Avatar video ad** (AI avatar presenting explainer content)

---

## 2. Brand DNA (ground every ad in this)

**Audience.** New and improving cyclists, roughly 25–50. They've caught the cycling bug in the last few years and want their riding to actually go somewhere. Likely training for a first sportive, first century, or just want Sunday rides to feel purposeful. Curious about pro racing but not racers themselves. NOT pros, NOT data-obsessed FTP-chasers.

**Tone.** Confident and calm, but inviting. Short sentences. Progress and purpose, not podiums. Explain jargon instead of assuming it. Coach in your pocket, not pro team manual.

**Brand voice do/don't.**

- DO: "Kilometres that count." "Your plan this week." "The next step up." "Ride with intent."
- DON'T: "Crush your FTP." "Suffer to win." "Elite performance." "Grind."

**Tagline.** *Train with purpose.*

**Colours.**

- Black `#000000` — canvas / base surface
- Maglia rosa `#E8458B` — primary accent (use sparingly, hero moments only)
- White `#FFFFFF` — primary text
- Steel blue `#4B6B8F` — secondary accent
- Mid grey `#A0A0A8` — secondary text
- Graphite `#111113` — cards / raised surface

**Typography.** Poppins family.

- Headings / UI: Poppins SemiBold (600)
- Body: Poppins Regular (400)
- Secondary / captions: Poppins Light (300)
- UPPERCASE labels: Poppins Medium (500) with 0.8 letter-spacing

**Visual direction.** Dark, cinematic, warm. Two dominant moods depending on the post:

- *Emotional posts* — documentary, warm, real-photo feeling. Natural light, unposed, authentic.
- *Practical posts* — clean, product-led. Flat-lays, detail shots, bike + kit.
- Either way: true-black backgrounds, disciplined composition, maglia rosa reserved for a single moment of colour.

---

## 3. Blog posts → format mapping

Starting with primaries (15 ads) and adding secondaries only where the post clearly earns two formats (+9 ads). Total target: **24 ads, produced in phases.**

| # | Blog slug | Theme | Primary | Secondary |
|---|---|---|---|---|
| 1 | beginner-cycling-first-month | Getting started | UGC | Image |
| 2 | beginner-cycling-gear-essentials | Gear | Avatar | Image |
| 3 | beginner-cycling-nutrition | Nutrition | Avatar | — |
| 4 | how-to-use-bike-gears | How-to | Avatar | — |
| 5 | how-to-choose-first-bike | Gear | Avatar | Image |
| 6 | beginner-bike-maintenance | How-to | Avatar | — |
| 7 | how-far-should-i-ride-as-a-beginner | Training | Image | — |
| 8 | learn-cycling-as-an-adult | Emotional | UGC | Image |
| 9 | cycling-routine-habit-building | Training | Image | UGC |
| 10 | muscle-soreness-after-cycling | Recovery | Image | — |
| 11 | cycling-gatekeeping-toxic-culture | Emotional | UGC | Image |
| 12 | first-group-ride-anxiety | Emotional | UGC | — |
| 13 | solo-cycling-as-a-woman | Emotional | UGC | Image |
| 14 | women-cycling-barriers | Emotional | UGC | Image |
| 15 | cycling-anxiety-traffic | Emotional | UGC | Image |

Rule of thumb: **emotional → UGC**, **practical/how-to → Avatar**, **listicle/data-hookable → Image**.

---

## 4. Per-post research task (Firecrawl + Perplexity)

For every blog post in the table above, do the following inside VSCode with Firecrawl and Perplexity attached:

**Step 1 — Read the post.** Use Firecrawl to crawl the local or deployed URL of the post (e.g. `https://etapa.app/blog/<slug>`). Extract:
- Final published title
- H2/H3 structure
- First paragraph (hook)
- Any stats, numbers, or quotable lines
- Meta description

**Step 2 — Find reference imagery.** Use Firecrawl to crawl Unsplash and Pexels search result pages for 2–3 search queries per post (e.g. for `solo-cycling-as-a-woman`: "woman road cycling alone", "woman cyclist confidence", "solo cyclist countryside"). For each post return:
- 3–5 direct image URLs (from Unsplash/Pexels — not hotlinks to random sites)
- Photographer name + credit URL
- One-line caption per image describing why it fits
- Commercial-use confirmation (Unsplash + Pexels licences are both fine)

**Step 3 — Find supporting stats (emotional posts only).** Use Perplexity to find 1–2 reputable, recent (post-2022) stats that strengthen the hook. Examples:
- *women-cycling-barriers* — % of women who say safety is their top barrier, participation gap stats
- *cycling-anxiety-traffic* — KSI stats, near-miss data, segregated infrastructure outcomes
- *learn-cycling-as-an-adult* — adult-learner numbers, British Cycling Breeze data
Return: stat, source name, source URL, year.

**Step 4 — Inspiration references.** For each post, one or two ad/editorial photography references in a similar aesthetic (dark, cinematic, warm). These go into the "Reference (optional)" slot on the AI image ad tool to prime composition/colour.

---

## 5. Deliverables (refactored 17-Apr — ingestion-ready)

Each brief is now **a direct mirror of the ad generator's form fields** — open the file, copy each section into the matching form field, attach the named assets, generate. No translation step.

Folder structure:

```
website/blog/ads/
├── BRIEF.md                        ← this file
├── plan.md                         ← master tracker (one row per post per format)
├── brand-assets-guide.md           ← what to upload to the tool's Asset library (one-time)
├── _library/                       ← the brand-kit PNGs referenced by every brief
│   ├── brand-squiggle-01.png
│   ├── brand-squiggle-etapa.png
│   ├── brand-squiggle-tagline.png
│   ├── brand-headline-poster.png
│   ├── brand-icon-72.png
│   └── brand-cta-card.png
├── templates/
│   ├── image.md                    ← Image-ad template (form-field-mapped)
│   ├── ugc.md                      ← UGC-video template (form-field-mapped)
│   └── avatar.md                   ← Avatar-video template (form-field-mapped)
└── <slug>/
    ├── image.md                    ← filled Image brief (if post has Image format)
    ├── ugc.md                      ← filled UGC brief (if post has UGC format)
    └── avatar.md                   ← filled Avatar brief (if post has Avatar format)
```

**Visual direction (updated).** The earlier brief leaned too photographic. Revised direction is **typography-led, not photography-led** — black backgrounds, Poppins headlines, the pink squiggle as the recurring motif. Stock photos are actively avoided across all formats. See `brand-assets-guide.md` and the updated on-creative spec inside each template.

**`plan.md` columns** (markdown table):
`# · slug · post title · primary format · secondary format · hook line · CTA · blog URL · UTM · status`

**`brief.md` per post — filled from the right template, containing:**

1. **Post context** (title, hook, 2-line summary)
2. **Ad format** (image / UGC / avatar)
3. **Hook line** — under 8 words, written in Etapa voice
4. **CTA** — under 5 words (e.g. "Read the full guide", "Get your beginner plan")
5. **AI transparency line** — the explicit "made with AI" treatment for this ad
6. **Format-specific fields**:
   - *Image*: what to advertise, a few details/benefits, optional idea prompt, aspect 9:16, model choice, 1 output
   - *UGC*: script (≤30s), character brief (age, gender, setting, vibe), hook + CTA card
   - *Avatar*: avatar choice, script (≤45s), on-screen text bullets, branded end card
7. **Reference imagery** — 3–5 URLs from Unsplash/Pexels with credits
8. **Stats/sources** — if any
9. **Blog link + UTM**

---

## 6. AI transparency — concrete spec

Every ad must carry **all three** of these layers:

**a) Visual mark (on every frame).** Small corner chip, bottom-left:

- Text: `Made with AI · Etapa`
- Font: Poppins Medium, 0.8 letter-spacing, uppercase, ~10px equivalent
- Colour: maglia rosa `#E8458B` text on 70%-opacity black rounded pill
- Safe margin: 24px from edges

**b) Script / copy.** Let the ad *say* it:

- *Image ads*: one of the headline patterns — "An AI made this ad. The coaching is real." / "AI-made. Human-approved." / "Made with AI. Tested on real riders."
- *UGC videos*: the AI character introduces themselves — e.g. "I'm an AI — but this advice comes from real cycling coaches."
- *Avatar videos*: avatar opens with "Hi, I'm [name] — Etapa's AI coach."

**c) Landing banner.** When the user clicks through to the blog post, show a thin top banner for that session:

> You arrived from an AI-generated ad. Here's the human thinking behind it → [Our AI transparency page]

Style: black background, maglia rosa 1px top border, Poppins Light 13px body + Poppins Medium link. Dismissible.

---

## 7. Tracking, linking & CTA

**UTM pattern.** All Instagram ads append:

```
?utm_source=instagram&utm_medium=<image|ugc|avatar>&utm_campaign=<slug>&utm_content=primary
```

`utm_content=secondary` for the secondary-format variant.

**CTAs by theme.**

- Emotional posts: *Read the full guide*
- Practical / how-to posts: *Get your beginner plan*
- Training / habit posts: *Start your first month*

**Instagram link handling.** If only one link is allowed, link directly to the blog post URL with UTMs. If using a landing page, `/instagram` on the site redirects by `utm_campaign` to the right post.

---

## 8. Production workflow

Work **batch by format**, not post-by-post — each format has a different creative muscle:

1. **Phase 1 — all Image ad briefs** (fast, static, low-cost to iterate).
2. **Phase 2 — all Avatar scripts** (highest-leverage for how-to posts).
3. **Phase 3 — all UGC scripts** (biggest emotional payoff, slowest to produce).

Keep a **shared reference library** at `website/blog/ads/_library/` with 6–10 evergreen images that get reused (beginner woman on a bike, commuter in traffic, group ride, bike on living-room floor, bike kit flat-lay, cyclist at dawn, etc.) so you're not re-sourcing for every brief.

**Review checkpoint.** After phase 1 (15 image briefs), Rob reviews voice, hook pattern, and transparency treatment before Phase 2 kicks off.

---

## 9. Acceptance criteria (per ad)

- [ ] Hook line ≤ 8 words, Etapa voice, no jargon
- [ ] CTA ≤ 5 words, one of the approved patterns
- [ ] AI mark visible, on-brand, correctly placed
- [ ] At least 3 reference image URLs with credits + commercial-use OK
- [ ] Blog URL + correctly-formed UTM
- [ ] Script (if video) ≤ 30s (UGC) or ≤ 45s (avatar)
- [ ] Stats (if used) from a reputable source, post-2022, cited
- [ ] Visual direction matches the post's theme bucket (emotional / practical)
- [ ] No pro-cycling / FTP / "crush it" language

---

## 10. Notes / things to fix before going live

- **Rotate API keys.** `.vscode/mcp.json` currently has the Firecrawl + Perplexity keys in plaintext. Rotate both keys, move them to env vars, and ensure the file is gitignored before the next push.
- **Landing banner.** Build the one-line banner component on the blog post template before the first ad goes live (so AI-ad traffic lands correctly).
- **/instagram redirect.** Wire this on Vercel — even a simple JS redirect file that reads the UTM campaign param and forwards is fine for v1.

---

## 11. Kickoff prompt for VSCode session

When you resume this in VSCode with Firecrawl + Perplexity attached, start the session with:

> Read `website/blog/ads/BRIEF.md`. Then execute sections 4 and 5 for all 15 blog posts, in the batch order in section 8. Start with Phase 1 (image ads only). After all 15 image briefs are drafted, stop and wait for my review before moving to Phase 2.

That should give the next session everything it needs to hit the ground running.
