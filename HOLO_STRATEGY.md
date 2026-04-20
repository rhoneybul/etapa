# Etapa — Holo AI Content Strategy

> How to use Holo AI to produce on-brand social + marketing content that
> actually converts. Synthesises BRAND.md, MARKET_RESEARCH.md, and
> SEO_CONTENT_STRATEGY.md into a single actionable playbook.
>
> Last updated: April 2026. Update when Holo settings / brand guidelines change.

---

## TL;DR

Holo is Etapa's **visual content engine**. It takes our brand profile + products and generates social-ready imagery, captions, and asset variations at a volume we couldn't produce by hand. This document is how we keep its output on-brand.

**Core principle:** Holo amplifies what we give it. Feed it precise brand settings, real screenshots, and jargon-free descriptions — it produces inclusive, calm, beginner-welcoming content. Feed it vague inputs — it defaults to generic fitness tropes (athletic men, mountain passes, "crush your goals" language) which actively hurts our positioning.

---

## 1. Why Holo, specifically

Etapa has three audiences: **beginners, women getting into cycling, returning riders**. All three are turned off by the dominant visual language of the cycling industry — lycra-clad men on Alpine roads, race-paced aesthetics, power-meter porn. Every competitor leans into that aesthetic because their customers are already there. We can't.

Holo gives us three things the alternatives don't:

1. **Brand consistency at volume.** Once brand settings are locked, every output inherits them — no need to prompt "dark background with magenta-pink accent, no emojis, plain English caption" on every generation.
2. **Multi-product support.** We have two products (the Etapa app + the Etapa MCP). Holo can generate content for both from the same brand settings.
3. **Social format variants in one pass.** A single scene → IG reel, IG post, IG story, LinkedIn post, Twitter card. Matches our "post 3x/week across platforms" cadence without creating bottlenecks.

**What Holo is not for:** hero brand photography (use Midjourney), precision app mockups (use Figma), video editing (use CapCut). Don't stretch it past its strengths.

---

## 2. Brand inputs that go into Holo

These should stay **exactly** in sync with `BRAND.md`. If BRAND.md changes, update Holo same day.

### Colors

| Hex | Role |
|---|---|
| `#E8458B` | Primary — warm magenta-pink. THE brand colour. |
| `#F472B6` | Secondary — lighter magenta, for hover/accent |
| `#000000` | Primary background — dark-first |
| `#0A0A0A` | Card / surface — slightly lifted black |
| `#FFFFFF` | Text / inversions |

> **Critical:** the primary is pink, not purple. If Holo's colour picker keeps pulling purple, manually override with the hex. Purple shifts the emotional register from "warm/inviting" to "cold/corporate" which defeats the whole brand.

### Color instructions (paste into Holo)

```
Primary brand color is warm magenta-pink (#E8458B), not purple.
Always paired with true black or near-black (#0A0A0A) for a premium,
quiet feel. Magenta should feel like an invitation, not a shout.
Avoid pastels, avoid greens, avoid corporate blue (occasional soft
blue #3B82F6 for secondary highlights OK). No gradients between
magenta and other colours.
```

### Brand name

> Etapa

### Industry

> SaaS/Digital (primary) · Health & Fitness (secondary)

### Mission (paste as-is)

> Etapa is an AI cycling coach for beginners and every rider after that. We're building this because cycling has always been gatekept — most apps assume you already know the jargon (FTP, TSS, zone 2), which is intimidating for someone just starting out, a woman getting into cycling, or a returning rider coming back after a break. Etapa explicitly doesn't do that. We speak in plain English, build personalised plans around real life, and treat "first 10 km ride" as a goal every bit as worthy as "first 200 km sportive". Our mission: open the gate to cycling for everyone.

### Extra guidelines (paste as-is)

```
VOICE AND TONE
- Plain English, always. NEVER use FTP, TSS, VO2max, zone 2, W/kg,
  or any training jargon unless user explicitly asks.
- Warm, encouraging, never patronising. Speak like a friend who
  happens to coach cycling.
- Active voice. Short paragraphs. Real examples over abstract claims.
- NO emojis in marketing copy. NO exclamation marks.
- NO "revolutionary", "unlock", "supercharge", "transform", "finally",
  "game-changing", "crush", "beast mode", "grind", "no excuses".
- Beginner-positive. Never implies reader should already know anything.

VISUAL STYLE
- Dark-first — black or near-black backgrounds with magenta accents.
- Generous whitespace. Quiet, confident layouts, not busy.
- Typeface: Poppins.
- Photography: REAL people cycling in EVERYDAY settings — rainy
  commutes, café stops, park laps, a tired face at the top of a hill.
  NO stock "athlete against mountain" heroics.
- Diversity by default. Different ages, body sizes, ethnicities, kit.
  Never all-male, never all-thin, never all-Lycra.
- Iconography: minimal line icons. Magenta for emphasis, never
  for whole surfaces.

TARGET AUDIENCES (in priority order)
1. Complete beginners — no structured training background
2. Women getting into cycling — put off by male-skewed culture
3. Returning / lapsed riders

DO NOT POSITION TOWARDS
- Competitive racers, Cat 1-3 riders
- Power-meter users, FTP-obsessed athletes
- Triathletes
- MAMIL (middle-aged men in Lycra) culture

APPROVED TAGLINES
- "Start riding. We'll handle the rest."
- "Your first (or fastest) cycling coach."
- "Cycling has always been gatekept. Etapa opens the gate."
- "Your coach. Your pace."
- "The coach that meets you where you are."
```

### Niches

- **Health & Fitness** (primary)
- **Mobile Apps** / SaaS
- Outdoor & Cycling (if available)
- ~~Supplements~~ — DO NOT include. Off-brand. Associates us with the hustle/performance bro culture we explicitly reject.

---

## 3. Products in Holo

Two products, both need to live in Holo. Keep them distinct — the app is the paid offering, the MCP is the free marketing companion.

### Product 1: Etapa App

- **Title:** `Etapa — AI Cycling Coach`
- **Description:** (see `BRAND.md` + the full copy in our previous Holo setup session — lives in the form itself)
- **Images to upload** (3-5 from `website/screenshots/`):
  - Primary: `home-page.PNG`
  - Angles: `show-plan.PNG`, `show-week.PNG`, `coach-chat.PNG`
  - In use: `set-goal.PNG` or a real phone-in-hand photo
- **Price anchor:** launch special — £99.99 lifetime, £7.99/mo, £49.99/yr, £14.99 for 3 months starter

### Product 2: Etapa MCP

- **Title:** `Etapa MCP — Cycling Coach for Any AI Assistant`
- **Description:** free + open-source, powers cycling coaching in Claude/ChatGPT/Cursor via MCP
- **Images to upload**:
  - Claude Desktop screenshot showing a generated plan (the hero asset — capture one if not saved)
  - Terminal / code snippet image showing `npx -y etapa-mcp`
  - GitHub / npm badge composition
- **Price:** free, always

---

## 4. Content categories (what we make)

Based on `SEO_CONTENT_STRATEGY.md`'s five core gaps, Holo generates content in six categories. Each has a brief, a style note, and an anti-pattern.

### A. Beginner reassurance (40% of output)

**Goal:** validate that cycling is for them. Relieve pressure. Dissolve imposter syndrome.

**Sample hooks:**
- "Your first ride can be 15 minutes. That counts."
- "Soreness in week one isn't failure. It's your body adapting."
- "You don't need Lycra. You don't need a £2,000 bike. You just need to start."
- "Slow is fine. Consistency beats pace, every time."

**Visual style:** single rider (often on an everyday bike), soft natural light, unposed, café stops / quiet roads / park paths. Never summit shots.

**Anti-pattern:** "No excuses! Crush your first 30km!" → instant fail.

### B. Women & inclusion (25% of output)

**Goal:** signal safety, welcome, belonging. Differentiate sharply from competitor content that implicitly excludes.

**Sample hooks:**
- "Solo cycling as a woman — what you actually need to know."
- "We don't do 'beast mode.' We do sustainable."
- "Cycling culture is changing. Be part of the part that's welcoming."
- "You're not an 'add-on cyclist.' You're a cyclist."

**Visual style:** women cycling — diverse ages, body types, skin tones. Often commuting, often with friends, often mid-chat. Never pink-it-and-shrink-it.

**Anti-pattern:** a slender woman in full matching kit, doing a solo sunrise climb. Not our audience.

### C. Product education (15% of output)

**Goal:** explain what Etapa does without sounding like a sales deck.

**Sample hooks:**
- "Here's how Etapa builds a plan around your actual week."
- "What it looks like when your coach adapts because you skipped Monday."
- "Not every plan needs 24 weeks. Etapa starts where you actually are."

**Visual style:** real app screenshots over dark backgrounds, with a single magenta annotation arrow or badge. Keep it quiet.

**Anti-pattern:** marketing-style "features grid" — looks like SaaS stock, doesn't distinguish us.

### D. MCP / AI distribution (10% of output)

**Goal:** attract the tech-native audience who already uses Claude/ChatGPT, demonstrate Etapa is serious enough to ship an MCP.

**Sample hooks:**
- "Every AI assistant can now build you a cycling plan."
- "The Etapa coach, live in Claude Desktop. Free, no account."
- "We built an MCP before we launched the app."

**Visual style:** terminal + Claude chat compositions. Dark backgrounds are native here. Only category where a tech aesthetic is right.

**Anti-pattern:** "Claude" / "GPT" / "AI" as empty marketing terms. Always show the tool in use.

### E. Returning rider / lapsed cyclist (7% of output)

**Goal:** "coming back isn't starting over." Low-shame, high-welcome.

**Sample hooks:**
- "You rode 100km a week. Then life happened. That's OK."
- "Your comeback doesn't need to look like your peak. It just needs to start."
- "A plan that respects who you were AND who you are now."

**Visual style:** older-feeling composition, often a solo rider, reflective mood. Not moody or depressing — contemplative.

### F. Culture / POV content (3% of output)

**Goal:** take a position the incumbents can't. Earn trust through voice.

**Sample hooks:**
- "Cycling has always been gatekept. Etapa opens the gate."
- "We don't trust apps that tell you to 'trust the process.'"
- "If the language puts you off, the product wasn't for you. That's not your fault."

**Visual style:** bold text-led graphics on black. Magenta for the key phrase. Almost editorial.

---

## 5. Rejection checklist — run every Holo output through this

Before posting anything Holo generates, check:

- [ ] **No emojis.** Zero tolerance. Even "🚴" is off-brand.
- [ ] **No exclamation marks.** We don't shout.
- [ ] **No forbidden words**: revolutionary, unlock, supercharge, transform, game-changing, crush, beast mode, grind, no excuses, FTP, TSS, zone 2, VO2max, W/kg, wattage, power zones, periodisation (unless we explain it).
- [ ] **Magenta is pink, not purple.** If it looks purple, reject or re-render.
- [ ] **People look real.** Not stock-athlete plastic. Not all-male. Not all-thin.
- [ ] **Backgrounds are dark.** Near-black, not charcoal-blue, not grey.
- [ ] **Caption sounds like a friend.** Read it aloud. If it sounds like a brand → rewrite.
- [ ] **CTA is soft.** "Register interest" / "Learn more" — never "Get started now" / "Sign up today".
- [ ] **No green or orange.** Both are common in health/fitness defaults. Not our palette.
- [ ] **No race imagery.** No pelotons, no numbers on jerseys, no finish lines.

Fail on any one → re-render or reject.

---

## 6. 90-day content cadence

Matches the priorities in `mcp-server/PLAN.md` and the launch roadmap.

### Weeks 1-2 — brand asset library (pre-launch foundation)

**Goal:** build a reusable library of 50+ on-brand Holo assets before we start posting regularly. Prevents scrambling later.

- 20x beginner reassurance images (cafés, quiet roads, commutes, solo rides)
- 10x women-focused images (diverse, unposed, no performance staging)
- 10x product screenshots (app on dark bg with single magenta highlight)
- 5x returning rider images (contemplative, mature, warm)
- 5x POV / text-led graphics with our approved taglines

**Success metric:** 50 saved assets tagged by category. Feels tired? Keep going to 70.

### Weeks 3-8 — MCP launch window + app pre-launch

Post cadence:
- **Instagram:** 3 posts/week + 3 stories/week + 1 reel/week
- **Twitter/X:** 5 posts/week + 1 thread/week
- **LinkedIn:** 2 posts/week (more tech + founder-story angle)
- **Blog:** 1 article/week from the SEO_CONTENT_STRATEGY.md list

Weekly theme rotation:
- **Week 3:** beginner reassurance (tie to SEO article #1: "How far should I ride?")
- **Week 4:** women in cycling (tie to SEO article #11: "Solo cycling as a woman")
- **Week 5:** MCP launch push (tie to blog post `/blog/etapa-mcp-launch`)
- **Week 6:** product education (how the app adapts — show the demo widget)
- **Week 7:** returning rider (tie to SEO article #28)
- **Week 8:** identity & belonging (tie to SEO article #21: imposter syndrome)

### Weeks 9-12 — app launch window

Cadence doubles. Content pivots to:
- App walkthrough reels (Holo renders + CapCut edits)
- User quotes / testimonials (once we have them)
- Coach personality spotlights (Clara, Sophie, Elena led)
- "Day in the life with Etapa" founder-voice posts

---

## 7. Producing a single piece of content end-to-end

Example workflow for one Instagram post:

1. **Pick the angle** from `SEO_CONTENT_STRATEGY.md`. Today: "Your body after the first week — what soreness is normal."
2. **Draft the caption** in Claude, using `BRAND.md` as context. Target ~80 words, no emojis, no jargon, one soft CTA.
3. **Generate the visual** in Holo. Brief:
   - Scene: tired but smiling cyclist stretching their calf, leaning on a park bench, soft golden-hour light
   - Format: Instagram square
   - Text overlay: "Soreness in week one isn't failure." (Poppins, white, bottom-left)
   - Accent: magenta underline on "isn't"
4. **Run the rejection checklist** above. Reject and regenerate if anything fails.
5. **Schedule in Buffer** with the caption. Tag #cycling #beginnercyclist #cyclinglife #womenwhocycle (matches our audiences, not "grindset" tags).
6. **Log the asset** in a Notion asset library with: category, angle, post date, engagement after 7 days.

Total time: ~25 minutes per post once set up. First week will be slower as you dial in prompts.

---

## 8. Hooks, captions, and copy patterns

Reusable patterns. Fill in the blanks.

### Opening hooks (first line of every post)

- "[X]. [Counter-assumption]."
  > "You don't need Lycra. You need a bike and 15 minutes."
- "The hardest part of [X] isn't [Y]. It's [Z]."
  > "The hardest part of cycling isn't fitness. It's feeling like you belong."
- "If [jargon term] means nothing to you — good."
  > "If FTP means nothing to you — good. Etapa doesn't use it either."
- "[Number] weeks in, and [unexpected observation]."
  > "Three weeks in, and you'll stop checking your speed."

### Closing CTAs (last line)

- "Etapa launches soon. Register interest at getetapa.com."
- "The app that meets you where you are → getetapa.com"
- "If this resonates, you're exactly who we're building for."
- "We'd love to hear how cycling's going for you."

Always one CTA, never stacked. Never "link in bio AND register here AND follow us".

### Forbidden openers

- "Did you know…"
- "We are excited to announce…"
- "In today's fast-paced world…"
- "Unlock the secret to…"
- Anything with an emoji.

---

## 9. How this connects to everything else in the repo

This strategy is not standalone. Each Holo-generated piece should link back to, or build on, content that already exists. Asset ecosystem:

| Holo produces | Feeds into | Lives at |
|---|---|---|
| Beginner reassurance post | Drives to specific SEO article | `website/blog/*.html` |
| Women-in-cycling post | Drives to `solo-cycling-as-a-woman` / `women-cycling-barriers` | `website/blog/` |
| Product education post | Drives to homepage MCP demo widget | `website/index.html#mcp` |
| MCP demo post | Drives to blog launch post + GitHub | `website/blog/etapa-mcp-launch.html`, `github.com/rhoneybul/etapa` |
| "Register Interest" push | Drives to homepage modal | captures via `/api/public/register-interest` |

Every piece of content = drive to a page we've already built = capture an email in `interest_signups`. Don't produce content that sends traffic to nowhere.

---

## 10. Success metrics

What we're measuring, in priority order:

1. **Register-interest signups attributed to Holo content** — tracked via UTM source `utm_source=instagram` etc. Check in the `interest_signups` table and admin dashboard.
2. **Demo interactions on getetapa.com/#mcp** — we added analytics for this; any traffic spike after a Holo post should show up in admin dashboard → Demo.
3. **Instagram engagement rate** — save-rate is the real signal (save = "this is useful") not likes.
4. **A/B CTA variant winner** — the demo widget is testing two CTAs right now. Holo posts amplify the traffic. After 2 weeks of steady traffic we should have statistical signal.
5. **Blog traffic attributed to social** — Plausible/Fathom (or GA if kept) showing `/blog/*` traffic with social referrers.

Vanity metrics we ignore: followers, likes, impressions without engagement. A beginner who saves a post to re-read on their commute is worth 10,000 impressions.

---

## 11. Pitfalls to avoid

Observed failure modes of similar AI content tools:

1. **Purple drift.** Every AI image tool defaults magenta → purple. Check every render. Override with hex if needed.
2. **Stock-athlete creep.** Defaults lean toward fit, white, male, athletic imagery. Always prompt the opposite.
3. **Emoji insertion.** Even with "no emojis" in guidelines, AI captions slip them in. Always check.
4. **Jargon drift.** If Etapa's app description mentions jargon, Holo learns that jargon is OK. Keep every description jargon-free.
5. **Over-producing.** It's cheap to make a lot. Resist. Three great posts a week beats twelve mediocre ones.
6. **Losing the voice.** Every 2 weeks, re-read `BRAND.md` and compare to the last 10 pieces of content. If the voice has drifted, reset by re-uploading the description.

---

## 12. When to override Holo entirely

Holo is great for volume. It's not great for:

- **Founder story content.** Use Claude for the copy, record voice/camera yourself, edit in CapCut.
- **Launch day hero image.** Commission or use Midjourney for the single most important image of the year.
- **Long-form video.** Use OBS + CapCut. Holo is for stills.
- **Anything with named real people (coaches).** Never let AI generate faces for Clara / Sophie / Elena. Use illustration or avatars.
- **Any time Holo's output feels "off."** Trust the gut. If it looks fine but feels generic, it is generic.

---

## 13. Monthly review ritual

Last Friday of every month, 30 minutes:

1. Pull top 10 performing Holo posts from Buffer/Metricool.
2. Pull bottom 5.
3. Look for patterns — what visual style / caption pattern / audience appeared more in the top 10?
4. Adjust Holo's description or generate prompts to lean into what works.
5. Update this doc's "hooks and captions" section if new patterns emerge.

---

## 14. Reference index — what to read when

| Question | Read |
|---|---|
| "What's our voice?" | `BRAND.md` → Tone section |
| "What does the app look like?" | `BRAND.md` → Style section |
| "Who are we NOT for?" | `BRAND.md` → "Who Etapa Is Not For" |
| "What are competitors doing?" | `MARKET_RESEARCH.md` |
| "What articles should I write?" | `SEO_CONTENT_STRATEGY.md` — 30 titles ranked by priority |
| "What's the MCP release plan?" | `mcp-server/PLAN.md` |
| "How do I submit to directories?" | `mcp-server/.submission-pack.md` |
| "Where do Holo posts send people?" | Section 9 of this doc |
| "What am I measuring?" | Section 10 of this doc |

---

## 15. Open questions / TODO

- [ ] Decide whether to commission 10-15 real lifestyle photos once (pro photographer + 3-4 real riders) — would be the highest-leverage asset investment before launch
- [ ] Decide on a single named photographer / illustrator for the coach illustrations vs. AI avatars
- [ ] Set a content calendar tool (Notion vs Airtable vs Buffer Calendar) — pick one, stop changing
- [ ] Wire Holo's output tracking to our admin dashboard if feasible (would show "post X → Y signups" in one view)
- [ ] Build a shared asset tagging convention (e.g. `etapa-beginner-cafe-01.png`) so we can find past assets fast

---

## 16. Change log

- **2026-04-20** — First version. Synthesises BRAND.md + MARKET_RESEARCH.md + SEO_CONTENT_STRATEGY.md + mcp-server/PLAN.md. Ready to paste into Holo on first setup.
