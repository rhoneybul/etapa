# Etapa — Strategy

> **Your one-stop marketing playbook.** Everything about positioning, social launch,
> Holo production, and SEO content lives here as one navigable document.
>
> Brand voice reference lives in [`BRAND.md`](./BRAND.md).
> Competitive research lives in [`MARKET_RESEARCH.md`](./MARKET_RESEARCH.md).
> Rolling weekly execution lives in [`THIS_WEEK.md`](./THIS_WEEK.md).
> Tech context lives in [`CLAUDE.md`](./CLAUDE.md).
>
> Last meaningful update: April 2026.

---

## Contents

- [Part 1 — The marketing playbook (index + big picture + pillars + rituals)](#part-1--the-marketing-playbook)
- [Part 2 — Social launch plan (30-day Instagram + trends + cadence)](#part-2--social-launch-plan)
- [Part 3 — Holo production playbook (prompts + rejection rules)](#part-3--holo-production-playbook)
- [Part 4 — SEO content strategy (30 articles + content gaps)](#part-4--seo-content-strategy)

Each part is self-contained. Jump to whichever you need.

---

# Part 1 — The marketing playbook

## Quick navigation

| I want to… | Read |
|---|---|
| Understand the brand voice & tone | [`BRAND.md`](./BRAND.md) |
| Understand the competitive landscape | [`MARKET_RESEARCH.md`](./MARKET_RESEARCH.md) |
| Pick an article to write next | [`SEO_CONTENT_STRATEGY.md`](./SEO_CONTENT_STRATEGY.md) |
| Generate social assets in Holo | [`HOLO_STRATEGY.md`](./HOLO_STRATEGY.md) |
| Run the 30-day launch campaign | [`SOCIAL_LAUNCH.md`](./SOCIAL_LAUNCH.md) |
| **Produce the first 9 Instagram posts right now** | [`FIRST_9_POSTS.md`](./FIRST_9_POSTS.md) |
| Distribute the MCP to directories | [`mcp-server/.submission-pack.md`](./mcp-server/.submission-pack.md) |
| See MCP release state + checkpoints | [`mcp-server/PLAN.md`](./mcp-server/PLAN.md) |
| Remember Etapa's tech context | [`CLAUDE.md`](./CLAUDE.md) |

---

## The big picture — what we're building and why

**Etapa is an AI cycling coach for the people most cycling apps ignore:** complete beginners, women put off by the male-skewed culture, and returning riders. Launching on iOS soon. Free pre-launch companion (Etapa MCP) already shipping on npm + the official MCP Registry.

**Our unfair advantages:**

1. **A genuine LLM-powered coach.** No competitor has this — they have rule-based "adaptive" algorithms.
2. **Beginner-first design.** The ~5x larger market of beginner cyclists is almost entirely unserved by dedicated cycling apps.
3. **Plain-English voice.** No FTP, TSS, zone 2, VO2max — we speak like a coach-friend.
4. **Pricing that lowers commitment anxiety.** £7.99/month (vs £15–20 competitors), plus a one-time £14.99 Starter plan for three months.

**Key window:** 12–18 months before TrainerRoad / TrainingPeaks ship credible AI features. Every week we spend building audience now compounds.

---

## The four pillars of our marketing

### Pillar 1 — Brand voice (tone, visual, positioning)

Owned by: [`BRAND.md`](./BRAND.md)

Every marketing decision is checked against these five voice principles:

1. **Plain English, always.**
2. **Like a knowledgeable friend, not a performance coach.**
3. **Celebrate the small wins. Mean it.**
4. **No judgment. No excuses. No intimidation.**
5. **Science-backed. Human-voiced.**

And these five visual principles:

1. **Dark, focused, distraction-free.** Black/near-black bg, magenta accent.
2. **Pink that says energy, not aggression.** #E8458B — never purple, never neon.
3. **Consumer polish, not sports-tool grit.**
4. **Real people. Real bikes. Real moments.**
5. **Warmth in every interaction, clarity in every screen.**

**When in doubt:** re-read `BRAND.md`.

### Pillar 2 — Market positioning (vs competitors)

Owned by: [`MARKET_RESEARCH.md`](./MARKET_RESEARCH.md)

Our positioning statement:

> *"The AI cycling coach built for real people — not just data nerds."*

Key differentiators, in priority order:

1. Genuine AI coach (non-negotiable)
2. Beginner-first design
3. Inclusive by design (including women)
4. Deep Strava integration
5. Accessible pricing

What we **don't compete on**: power analytics (TrainingPeaks owns), content/video libraries (Zwift/Wahoo own), hardware (too capital-intensive), B2B coaching marketplace (saturated).

### Pillar 3 — SEO content (long-tail blog strategy)

Owned by: [`SEO_CONTENT_STRATEGY.md`](./SEO_CONTENT_STRATEGY.md)

**30 articles identified**, tiered by priority. The top 5 to publish (several already live in `/website/blog/`):

1. ✅ How Far Should I Ride as a Beginner?
2. ✅ The Complete Beginner's First Month
3. ✅ Your Body After the First Week of Cycling
4. ✅ How to Shift Gears (jargon-free)
5. ✅ Solo Cycling as a Woman

Our SEO edge: competitors have **completely ignored** beginner / women / returning-rider content. Every gap is high-volume, low-competition, and perfectly aligned with our brand voice. The 30-article list covers confidence, identity, women-specific needs, psychological barriers, and the return-to-cycling journey.

### Pillar 4 — Distribution + audience (social, MCP, registries)

Owned by: [`HOLO_STRATEGY.md`](./HOLO_STRATEGY.md) + [`mcp-server/.submission-pack.md`](./mcp-server/.submission-pack.md) + [`mcp-server/PLAN.md`](./mcp-server/PLAN.md)

Two parallel motions:

**Social / content flywheel:**
- Holo generates on-brand Instagram + Twitter + LinkedIn visuals at volume
- Every post drives to a blog article, the MCP demo widget, or the register-interest CTA
- UTM-tagged so we can measure signups attributed to each channel

**Technical / developer distribution:**
- Etapa MCP is live on npm, the official MCP Registry, and directories like Glama / mcp.so / Smithery
- Screenshot of Claude Desktop using Etapa is our single highest-leverage marketing asset

---

## The master 90-day plan

Synthesises every doc's roadmap into one timeline.

### Weeks 1-2 (now) — foundation

**Goal:** every piece of infrastructure we need to run a proper campaign is in place.

- [x] Brand guidelines locked (`BRAND.md`)
- [x] Market positioning locked (`MARKET_RESEARCH.md`)
- [x] SEO strategy + 30 articles (`SEO_CONTENT_STRATEGY.md`) — 5 published
- [x] Etapa MCP shipped to npm + official Registry
- [x] Website `/#mcp` section + interactive demo widget live
- [x] Register-interest flow + Slack webhook wired
- [x] Admin dashboard: signups + demo analytics + A/B testing
- [x] Holo AI onboarding complete (`HOLO_STRATEGY.md`)
- [ ] Publish remaining 5-10 top-tier SEO articles
- [ ] Build 50-asset Holo content library
- [ ] Set up Buffer / Metricool for scheduling

### Weeks 3-6 — pre-launch campaign

**Goal:** build audience. Land MCP in front of developers. Land blog content in front of beginners.

**Weekly cadence:**
- 3 Instagram posts + 3 stories + 1 reel
- 5 Twitter/X posts + 1 thread
- 2 LinkedIn posts (tech + founder story)
- 1 blog article from SEO_CONTENT_STRATEGY.md
- 1 Reddit / HN / Discord post *rotating each week*

**Weekly themes (rotate):**
- Week 3: Beginner reassurance
- Week 4: Women in cycling
- Week 5: MCP launch push (tie to blog post)
- Week 6: Product education (show the demo widget working)

**Distribution milestones:**
- PR to `modelcontextprotocol/servers`: ❌ skipped (deprecated list)
- Glama submission: 🚧 resubmit under both Server + Connector tabs
- mcp.so submission: ⏳ do this week
- Smithery submission: ⏳ adds one-click install, high leverage
- Reddit r/ClaudeAI post: ⏳ Tuesday morning PT
- Show HN: ⏳ Tuesday-Thursday AM PT
- Twitter/X announcement thread: ⏳ with Claude Desktop screenshot

### Weeks 7-10 — app launch window

**Goal:** convert audience into App Store installs.

Cadence doubles. Content pivots to:
- App walkthrough reels (record in OBS, edit in CapCut, use Holo for thumbnails)
- Founder-voice posts ("why we built this")
- Coach personality spotlights (Clara, Sophie, Elena, Lars, Matteo, Tom)
- "Day in the life with Etapa" series
- User quotes / testimonials as soon as we have them
- ProductHunt launch bundled with the iOS submission

### Weeks 11-13 — post-launch sustain

**Goal:** retention and compound. The first 3 months of App Store presence set long-term rank.

- Shift content ratio: more product education, more user stories
- Build newsletter (Beehiiv / Substack) with 1 edition/week
- Respond to every App Store review
- Instrument PostHog funnels; tune the parts that leak

---

## The consolidated resource list

### Tools (in priority order)

#### Free / near-free

| Tool | Use | Status |
|---|---|---|
| **Claude (desktop or web)** | Strategy brain, copy drafting | Already using |
| **Claude Projects** | Brand + content context for every chat | Set up |
| **Holo AI** | Social visual content at volume | Onboarding now |
| **OBS Studio** | Screen-record demos + app walkthroughs | Plan to use |
| **CapCut (desktop)** | Video editing, auto-captions, silence-remove | Plan to use |
| **Buffer (free tier)** | Schedule IG / X / LinkedIn | Plan to use |
| **ElevenLabs** | AI voiceovers, 10k chars/mo free | Plan to use |
| **Plausible or Fathom** | Privacy-friendly web analytics | Evaluate |
| **Notion** | Asset library + content calendar | Recommended |
| **GitHub + Railway** | All the technical infra | Already using |

#### Paid tier — worth it

| Tool | Approx cost | Use |
|---|---|---|
| **Midjourney** | £8–20/mo | Hero brand photography, single big shots |
| **Descript** | £12–30/mo | Transcript-based video editing, silence removal |
| **Submagic / Opus Clip** | £15–30/mo | Auto-clip long-form into short-form |
| **PostHog** | free to £0.01/event | Product analytics once app is live |
| **Beehiiv / Substack** | free to £8/mo | Newsletter (recommend once audience >500) |

#### Paid tier — skip for now

| Tool | Why not yet |
|---|---|
| HeyGen (AI avatars) | Founder-on-camera is more authentic for pre-launch |
| Runway (AI video) | Expensive per-second, not worth until brand needs premium B-roll |
| ProductHunt paid launches | Save for iOS app launch day |

### Templates and copy banks

| Asset | Location |
|---|---|
| Approved taglines (5) | `BRAND.md` → Taglines section |
| Voice principles (5) | `BRAND.md` → Tone section |
| Visual principles (5) | `BRAND.md` → Style section |
| MCP short/medium/long descriptions | `mcp-server/.submission-pack.md` → Reusable assets |
| Reddit post copy | `mcp-server/.submission-pack.md` → Section 10 |
| Show HN title + first comment | `mcp-server/.submission-pack.md` → Section 11 |
| Twitter/X launch thread (4 tweets) | `mcp-server/.submission-pack.md` → Section 9 |
| Holo post patterns + hooks | `HOLO_STRATEGY.md` → Section 8 |
| Rejection checklist for AI output | `HOLO_STRATEGY.md` → Section 5 |

### Audiences (priority-ordered)

From `BRAND.md` and `MARKET_RESEARCH.md`:

| # | Audience | Size | Primary barrier | Why Etapa wins |
|---|---|---|---|---|
| 1 | **Beginners** (25-45, want to start) | ~5× serious cyclist market | Intimidation, complexity, price anxiety | No jargon, plain English, £7.99 + Starter |
| 2 | **Women getting into cycling** | +15%/yr growth | Culture, language, rigid scheduling | Inclusive by default, female coaches, adaptive scheduling |
| 3 | **Returning / lapsed riders** (30-55) | Long-term retention value | Feels like regression | Plan respects where they are, not were |

### Who we're explicitly NOT marketing to

- Cat 1-3 racers
- Power-meter users, FTP-obsessed
- Triathletes
- MAMIL ("middle-aged men in Lycra") culture

Put marketing money here = poisons brand. Ignore.

---

## Marketing decision framework

When you're uncertain about a piece of content, run it through this four-question test:

### 1. Does it use plain English?

Any jargon (FTP, TSS, zone 2, VO2, wattage, periodisation, cadence — unless we're explicitly defining it) → rewrite. No exceptions.

### 2. Does it make a beginner feel welcome?

If it assumes prior knowledge, prior fitness, prior gear, prior commitment — rewrite. The test: would someone who's never been on a road bike understand it?

### 3. Would the cycling industry already make this content?

If yes → skip. We only win by making what competitors structurally can't or won't make. "Training zones explained" has been done 1,000 times. "Why I don't know what FTP means and that's fine" has been done zero.

### 4. Does it drive somewhere measurable?

Every piece ends with a specific CTA: register interest / read a blog post / install the MCP / try the demo widget. Content that drives to nowhere is vanity content. Skip.

If all four pass → ship it.

---

## Weekly rituals (the minimum viable routine)

### Monday — plan

- Review last week's top-performing content (Buffer / IG insights / admin dashboard → Demo).
- Pick this week's theme from the rotation.
- Draft 3-5 pieces of content (hooks, captions, visual prompts) in Claude.
- Queue Holo generations.

### Wednesday — produce

- Render 10-15 Holo variants.
- Apply the rejection checklist.
- Pick 5 keepers, schedule in Buffer.
- Record any planned videos in OBS. Rough-cut in CapCut.

### Friday — publish + measure

- Confirm all scheduled posts went live.
- Check admin dashboard: signups this week, demo conversions, A/B variant performance.
- Quick note in a running log (just a Notion page): what worked, what flopped, what to try next week.
- One creative "punt" — something outside the usual rotation just to test.

### Last Friday of the month — review

- Top 10 / bottom 5 posts.
- Patterns? Hooks? Visual styles?
- Update `HOLO_STRATEGY.md` if new patterns emerge.
- Update this file's 90-day plan if reality has shifted.

---

## Success metrics

In priority order:

1. **Register-interest signups** — the single most important metric pre-launch. Attributed by UTM and demo session. Check `interest_signups` table + admin dashboard.
2. **Demo widget interactions** — tool proof-of-value. Admin dashboard → Demo stats.
3. **A/B variant conversion rate** — tune the CTA messaging.
4. **MCP npm downloads + GitHub stars** — developer audience size.
5. **Blog page views / search rankings** — long-term SEO compounding.
6. **Save-rate on social** (saves > likes) — content genuinely useful.

Vanity metrics ignored: followers, likes, impressions without engagement.

---

## Risks and mitigations

### Risk: Brand voice drifts as we scale content volume

Most likely cause: Holo starts learning its own outputs, or we reuse "generic fitness" phrasing when we're tired.

**Mitigation:** Run the 4-question framework on every piece. Re-read `BRAND.md` fortnightly. Monthly content review ritual.

### Risk: MCP / AI content only reaches developers, not cyclists

**Mitigation:** Force content ratio of ~60% beginner-facing + 25% women-facing + 15% MCP / developer. Don't let the MCP tail wag the brand dog.

### Risk: Incumbents ship AI features faster than predicted

**Mitigation:** The 12–18 month window is a *floor*, not a ceiling. Even if TrainerRoad ships an LLM coach in Q4, they can't retroactively change their pricing, brand voice, or beginner hostility. Keep leaning into those three moats.

### Risk: Competing for attention with the founder's time

**Mitigation:** The weekly rituals are deliberately minimal (~8 hours/week total). If content slips, cut output volume before cutting quality. Three great posts beat twelve bland ones.

### Risk: Launch content pipeline stalls when iOS app hits App Store

**Mitigation:** Front-load the asset library in weeks 1-2. By launch day we should have 100+ reusable assets so launch week production is mostly scheduling, not creation.

---

## When to come back to this doc

- Start of every marketing session (anchor yourself)
- When you're picking this week's theme
- When onboarding a freelancer or team-mate
- When something feels off and you can't articulate why
- Monthly review ritual

---

## Change log

- **2026-04-20** — Initial version. Consolidates BRAND.md, MARKET_RESEARCH.md, SEO_CONTENT_STRATEGY.md, HOLO_STRATEGY.md, mcp-server/PLAN.md into a single starting point for marketing sessions.

---

# Part 2 — Social launch plan

## Section 1 — The 10 viral cycling trends right now (April 2026)

Pulled from live web research on Cyclingnews, Cyclist, Cycling Weekly, ROUVY, Modash, Favikon, Samsara Cycle, Display Purposes, best-hashtags.com, newengen.com, and others. Ranked by **alignment with Etapa's audience** (beginners, women, returning riders), not just raw volume.

| # | Trend | What's actually going viral | Etapa fit |
|---|---|---|---|
| 1 | **"Pattern interrupt" 7-15s Reels** | Short, sharp, no intros, no logos. Start mid-action. Hook in <3 seconds. Algorithm now prioritises **watch-through rate + shares > saves > comments > follows**. 500 shares beats 5000 likes. | ⭐️⭐️⭐️⭐️⭐️ On-brand: minimal, quiet confidence. No fluff. |
| 2 | **Style + self-expression in cycling kit** | Nails, bandanas, embroidered patches, hair accessories, bright/playful prints. Huge at Tour de France Femmes 2026. Women's cycling style is becoming personal, not performative. | ⭐️⭐️⭐️⭐️ Perfect for our women-focused content pillar. Lean in. |
| 3 | **"Rise of the non-pro influencer"** | 20-30s Gen-Z/millennial riders posting everyday rides, not podium shots. UK <35 cyclists up 80% since 2019 (Strava data). The average rider is now the hero. | ⭐️⭐️⭐️⭐️⭐️ Our entire brand thesis. |
| 4 | **"Day in the life" storytelling Reels** | POV + mini-narratives. Viewers stay longer on story than on features. Paired with trending sounds (e.g. "Pretty Little Baby"). | ⭐️⭐️⭐️⭐️ Map to "day in the life of a beginner cyclist". Anti-pro. |
| 5 | **"World Stop!" / "Hold O to Run Faster" gamified formats** | Transformation / interactive overlay formats by @browsbyzulema and others. Turn passive watching into replay behaviour. | ⭐️⭐️⭐️ Usable for "30 days on the bike: the transformation". |
| 6 | **Nostalgic carousel posts** | 5-10 image carousels with handwritten-style text + vintage/faded filters. Massive saves. | ⭐️⭐️⭐️⭐️ Perfect for long-form tips ("10 things I wish I'd known on my first ride"). |
| 7 | **Community cycling groups / accountability** | Influencers running challenges, group rides, "ride with me" series. Fastest-growing segment on cycling IG. | ⭐️⭐️⭐️⭐️⭐️ Maps to our MCP demo + "register interest" funnel — drive people to join. |
| 8 | **Bike-maintenance / beginner how-tos** | Tutorials on gear shifting, puncture fixing, clipless, etc. — specifically for people who don't already know. Evergreen saves magnet. | ⭐️⭐️⭐️⭐️⭐️ Direct overlap with our SEO article list. |
| 9 | **Minimal, story-driven captions** | 2026 = the death of long captions. If the video tells the story, the caption is 1-2 lines max. Poem-style or one-liner + CTA. | ⭐️⭐️⭐️⭐️⭐️ Matches our "plain English, no fluff" tone. |
| 10 | **"Slow cycling is valid" counter-movement** | A small but rapidly-growing POV pushing back on performance culture. Captions like "I rode 8km today and that's enough". Often women + returning riders. | ⭐️⭐️⭐️⭐️⭐️ This is *literally* our brand. We should own the hashtag. |

### What we explicitly IGNORE

- Pro-racing content (we can't compete, and it's off-brand)
- Gear / kit reviews with affiliate links (brand-dilutive)
- "Crush", "beast mode", "grind" formats (anti-inclusion)
- FTP / zone / power-meter edu content (off-audience)

---

## Section 2 — The three content pillars (60/25/15 ratio)

Everything Holo produces over the next 30 days slots into one of these three pillars. Weekly content plan rotates between them so we're never one-note.

### Pillar 1 — Beginner reassurance (60%) — "you can do this"

**Audience:** primary + tertiary (beginners + returning).

**Trend alignment:** #1, #4, #6, #8, #9

**Angles:**
- "You don't need Lycra. You need a bike and 15 minutes."
- "Week 1 soreness is adaptation, not failure."
- "Slow is fine. Slow is how everyone starts."
- "First 10 km. It counts."
- "Here's what actually matters on ride one."

**Hashtag set (rotate 8-12 per post):**
`#beginnercyclist #cyclingbeginner #firstride #cyclingforlife #cyclinglife #cyclinggirls #slowandsteady #cyclingcommunity #newcyclist #cyclingmotivation #rideyourbike #getoutthere`

### Pillar 2 — Women + inclusion (25%) — "we built this for you"

**Audience:** secondary.

**Trend alignment:** #2, #3, #7, #10

**Angles:**
- "Cycling kit isn't a uniform. Wear what you like."
- "You're not an 'add-on cyclist.' You're a cyclist."
- "Solo rides as a woman — what helps you actually feel safe."
- "Three women who started cycling this year, three stories."
- "We don't do 'beast mode.' We do sustainable."

**Hashtag set:**
`#womencycling #cyclinggirl #womenwhocycle #femaleCyclist #womenonbikes #cyclingladies #cyclingpassion #cyclingwomen #girlsonbikes`

### Pillar 3 — Product + MCP + launch teasers (15%) — "come along"

**Audience:** all three + the tech-native early-adopter crowd.

**Trend alignment:** #4, #7, #8

**Angles:**
- "Ask any AI assistant to build you a cycling plan. We shipped the MCP today."
- "Behind the scenes: how Etapa builds a plan around your week."
- "6 AI coaches. Pick the one who sounds like you."
- "Register interest — we launch in [N] weeks."

**Hashtag set:**
`#etapa #aicoach #cyclingapp #trainingplan #buildingInPublic #claudeAI #cyclingcommunity`

---

## Section 3 — 30-day content calendar (daily)

**Platform cadence** per day (minimum viable in brackets):

| Platform | Full | Minimum Viable |
|---|---|---|
| Instagram | 1 reel OR post + 2 stories | 1 post |
| TikTok | 1 reel (mostly repurposed from IG) | skip |
| Twitter/X | 2 posts | 1 post |
| LinkedIn | 1 post every 2 days | 1 post/week |
| Threads | 1 post | skip |

**Legend:** `P1` = beginner pillar · `P2` = women pillar · `P3` = product pillar · `Reel` = video · `Post` = static/carousel · `Text` = words-only

### Week 1 — "Cycling without the gatekeeping" (brand introduction)

| Day | Platform | Pillar | Format | Hook / concept | Holo prompt seed |
|---|---|---|---|---|---|
| Mon | IG | P1 | Reel 10s | "Here's what a beginner ride actually looks like." Handlebar POV, café stop, no sweat-drenched climbs. | POV handlebar shot on a quiet city street, late afternoon light, cyclist wearing jeans not Lycra, magenta accent on text overlay |
| Tue | IG | P1 | Carousel 6 slides | "10 things I wish I'd known on my first ride." Slow reveal, one tip per slide. | 6-panel nostalgic carousel, faded film colour, hand-annotated magenta arrows, each slide a single short tip |
| Wed | IG | P2 | Reel 7s | "What cycling kit actually looks like for beginners." Jeans, trainers, a bandana. | Woman on a hybrid bike wearing regular clothes + one playful accessory (bandana), warm natural light, "wear what you like" text overlay |
| Thu | IG | P3 | Post | "Your cycling coach, now in every AI assistant." Claude Desktop screenshot with generated plan. | Dark background, Claude Desktop chat render showing Etapa generating a plan, magenta "new" badge |
| Fri | IG | P1 | Reel 12s | "Week 1 vs Week 4 — what actually changes." Before/after split-screen, with specific micro-wins. | Split-screen reel concept: left = wobbly first ride, right = same person at week 4 looking comfortable. Subtle magenta dividing line |
| Sat | IG | P1 | Post | "Your first 10 km ride was not small." One-line big-type editorial graphic. | Editorial text-led graphic: black background, big magenta "10 km." + small white subtext "is still cycling." |
| Sun | IG Story | P2 | 3 stories | "Cycling kit I've seen this week." Diverse riders in street clothes + 1 bandana. | 3 portrait stories, everyday riders at café/park/commute, tagged with their clothing style |

**Twitter/X this week (repurpose, not republish):**
- Mon: thread — "5 things that intimidated me about cycling (and what actually happens)"
- Wed: quote-tweet a pro-racing tweet with a thread on why beginner cycling is the bigger market
- Fri: launch-week tease: "The Etapa app hits iOS in 4 weeks. The MCP is already live."

---

### Week 2 — "Ask the coach" (MCP-powered content)

| Day | Platform | Pillar | Format | Hook / concept | Holo prompt seed |
|---|---|---|---|---|---|
| Mon | IG | P3 | Reel 15s | "I asked Claude to build me a cycling plan in 30 seconds." Screen recording of the demo widget on getetapa.com. | (Not Holo — screen-record via OBS, edit in CapCut. Add magenta progress bar underlay.) |
| Tue | IG | P1 | Carousel 5 slides | "I missed Monday's ride. Here's what the Etapa coach said." Screenshot the `ask_cycling_coach` response, split across slides. | Export real coach response, 5-slide carousel design, each slide a distinct piece of advice |
| Wed | IG | P2 | Reel 8s | "The cycling app we wished existed when we started." Woman-led voiceover, quick cuts of app screens. | Phone-in-hand mockup, varied hands (diverse), app UI visible. Dark background. |
| Thu | IG | P1 | Post | "Why rest days aren't the enemy." Editorial-style. | Text-led graphic: black bg, magenta "Rest is training." + small white subtext "Your body adapts while you sleep, not while you ride." |
| Fri | IG | P3 | Reel 10s | Coach personality reveal — Clara, Sophie, or Lars. | Portrait-framed illustration (not photo-real to avoid "AI face"), brand magenta accent frame, coach name + one-line description |
| Sat | IG | P2 | Carousel 4 slides | "Women I've met cycling this month." 4 diverse riders + one-liner quote each. | 4-panel carousel, each slide a different woman (diverse ages/body types), café/park/commute settings, quote overlaid in small magenta |
| Sun | IG Story | P1 | Poll | "What's stopped you from starting cycling?" Poll: fitness / gear / fear of traffic / none of the above | Quick story graphic, poll sticker, dark bg |

**Twitter/X this week:**
- Tue: thread — "Most cycling apps assume you already know what FTP means. Ours doesn't."
- Thu: single post with the Claude Desktop screenshot + line "Every AI now has a cycling coach. Free. Install: npx -y etapa-mcp"
- Sat: retweet / amplify any user who's tried the MCP

---

### Week 3 — "Real rides, real people" (community + UGC push)

| Day | Platform | Pillar | Format | Hook / concept | Holo prompt seed |
|---|---|---|---|---|---|
| Mon | IG | P1 | Reel 7s | "Wobbly first rides, before they got confident." Montage of 3 returning-rider clips. | 3-clip montage of unsteady first-ride moments, gentle warm colour grade, dignified — not mocking |
| Tue | IG | P2 | Carousel 6 slides | "What changes in your head after 30 days on the bike" — psychological wins. | 6-slide carousel, each slide a single psychological win ("you stop apologising for being slow") |
| Wed | IG | P3 | Post | "The Etapa app is 2 weeks away." Simple launch teaser. | Text-led launch graphic: black bg, magenta "2 weeks" countdown, getetapa.com |
| Thu | IG | P1 | Reel 15s | "A ride is anything that gets you on the bike." Cut between 5 riders doing very different rides (commute / park loop / café / family ride / groceries). | 5 riders, 5 different ride contexts, all in one Reel. Magenta transition flashes between clips |
| Fri | IG | P2 | Reel 10s | "Solo ride safety — what we actually do." Real safety tips from women riders. | Woman cyclist on a quiet tree-lined road, text overlays listing 3 concrete habits (tell someone, lights on in daylight, known route first) |
| Sat | IG | P1 | Post | "The hardest part of cycling isn't fitness. It's feeling like you belong." | Editorial graphic, two-line breakdown, magenta underline on the second line |
| Sun | IG Story | all | 5 stories | "Your questions, answered by the Etapa coach." Repurpose real `ask_cycling_coach` responses. | Screenshot 5 of the best coach responses, slot into 5 consecutive stories |

**Twitter/X this week:**
- Mon: Show HN-style post — "I shipped an MCP before my app was out. Here's why." Link to blog post.
- Wed: 2-week countdown tweet
- Fri: ask — "Cyclists of X, what put you OFF cycling when you were starting?" Engage with every reply.

---

### Week 4 — "Launch week" (drive installs)

| Day | Platform | Pillar | Format | Hook / concept | Holo prompt seed |
|---|---|---|---|---|---|
| Mon | IG | P3 | Reel 15s | "Etapa launches Friday. Here's what it does in 15 seconds." Fast cut through 6 app screens. | App screenshot montage with magenta transition flashes, quick text overlays, no voiceover |
| Tue | IG | P1 | Carousel 7 slides | "Your first 4 weeks on Etapa — what to expect." Week-by-week. | 7-slide carousel: intro + week 1-4 + outro. Gentle progression imagery. |
| Wed | IG | P2 | Reel 10s | "Clara. Sophie. Elena. Lars. Matteo. Tom. Pick your coach." | Six illustrated coach avatars in sequence, one-line personality each, magenta brand frame |
| Thu | IG | P3 | Post | Full launch graphic — date + App Store link. | Launch poster: "Launching tomorrow." magenta date, black bg, small subtext with app store badge |
| Fri | IG | P3 | Reel 12s | **LAUNCH DAY** — "It's live. Link in bio." Founder/brand-voice clip. | Screen-record of the App Store page loading + install, triumphant but quiet, no shouting |
| Fri | IG | P3 | Post | Launch announcement carousel. | 5-slide carousel: features / pricing / coaches / what's next / download |
| Sat | IG | P1 | Reel 8s | "First day reactions from real users." Screenshot real positive DMs/reviews (if any). | 3-4 DM/review screenshots overlaid on a phone-in-hand background |
| Sun | IG | all | Story highlight compilation | Save the week's best stories as a permanent highlight reel. | — |

**Twitter/X this week:**
- Mon: launch-week thread — "We ship Friday. Here's everything that went in."
- Wed: ProductHunt prep (if launching there Friday)
- Fri: live-tweet launch day
- Sat: thank-you thread to every early supporter who engaged

---

## Section 4 — Holo production workflow (Sunday session, 90 min)

Don't produce content daily. **Produce weekly in one session, schedule to Buffer, then spend daily time engaging, not creating.**

### Sunday 90-min content session

1. **Open CONTENT_PLAYBOOK.md + HOLO_STRATEGY.md + this file** (5 min)
2. **Look at this week's 7 rows** above. For each, write:
   - The caption (use hooks from `HOLO_STRATEGY.md` section 8)
   - The visual brief (re-use the Holo prompt seed + any adjustment)
   - Hashtag set (copy from pillar-specific list in Section 2)
   (30 min — 4 min each)
3. **Generate in Holo** (30 min) — produce 2-3 variants per post. Apply the rejection checklist from `HOLO_STRATEGY.md` Section 5.
4. **Schedule in Buffer** (15 min) — queue all 7 days at once. Set optimal times (IG: 11am-1pm or 7-9pm local).
5. **Write 2 Twitter threads** for the week (10 min) — draft in Claude, post manually daily.

### Mon-Sat daily engagement (15 min/day)

- Reply to every comment on your posts (5 min)
- Reply to every DM (5 min)
- Comment meaningfully on 5 beginner/women-cycling accounts (5 min)

Volume of content isn't the growth lever. **Engagement in the first 60 minutes after posting is.**

---

## Section 5 — Holo prompt library (paste-ready)

Frequently-needed prompt seeds. Update when Holo learns our brand.

### Beginner reassurance visuals

```
A real cyclist in everyday clothes (jeans, trainers) on a hybrid
bike at a quiet urban café stop. Warm afternoon light. Dark overall
palette with one small magenta accent (a bandana, a bike frame
detail, or a text overlay). No Lycra. No pro imagery. Shot looks
candid, not staged. Etapa brand.
```

### Women + inclusion visuals

```
A woman cyclist aged 25-50, diverse ethnicity/body type, on an
everyday bike (hybrid, commuter, or e-bike). Wearing regular
clothes with one expressive accessory (bandana, bright sock,
nail art visible on the handlebars). Commute or café setting, not
mountain. Warm natural light. Dark palette with magenta accent.
Unposed. Calm confidence.
```

### Product education visuals

```
Pristine rendering of the Etapa app on an iPhone against a
true-black background. Single magenta accent (a pink highlight
line under one key piece of text, or a small magenta arrow
pointing to a feature). No gradient. No shadow-heavy drop.
Minimal. Consumer-polish not sports-tool.
```

### MCP / developer visuals

```
A Claude Desktop window on a dark Mac UI, with a visible chat
where the user asked "build me a 3-week cycling plan" and Etapa
has responded with a structured plan. Subtle magenta highlight
on the Etapa tool call indicator. Clean. Aspirational-developer
aesthetic. Matches our website dark aesthetic.
```

### Launch visuals

```
Editorial-style text-led graphic. True-black background. Very
large magenta headline ("2 weeks." or "Launching Friday."), small
white subtext below. Poppins typeface. Wide margins. Feels like
a New York Times Magazine cover, not a SaaS ad.
```

---

## Section 6 — Caption patterns (steal these)

Short, sharp, minimal. Follow the 2026 "minimal captions win" rule.

### The one-liner

```
Your first 10 km ride is still cycling.
— getetapa.com
```

### The counter-assumption

```
You don't need Lycra.
You don't need a £2,000 bike.
You need a bike and 15 minutes.
— getetapa.com
```

### The reframe

```
Slow isn't failure.
Slow is how everyone starts.
— getetapa.com
```

### The direct invite

```
Ask any AI to build you a cycling plan.
Etapa MCP — free, live today.
npx -y etapa-mcp
```

### The launch-week

```
iOS on Friday.
Register interest → getetapa.com
```

### NEVER use

- "Crush your goals"
- "Unlock your potential"
- "Revolutionary new app"
- "🚴" (or any emoji)
- Exclamation marks in marketing copy
- "We're excited to announce"
- Anything with "game-changing"

---

## Section 7 — Weekly review checklist

Every Sunday evening, 15 minutes.

- [ ] Which post had the highest saves-per-view? (Our north-star metric.)
- [ ] Which had the highest share-rate? (Algorithm fuel.)
- [ ] Which pillar (P1/P2/P3) performed best this week?
- [ ] Any caption patterns that clicked? Update Section 6.
- [ ] Any Holo prompt seeds that consistently produced on-brand output? Update Section 5.
- [ ] Admin dashboard: did the week's posts correlate with a spike in signups / demo interactions / A/B conversion?
- [ ] One concrete change to make next week based on above.

---

## Section 8 — Quick-reference metrics & benchmarks

Targets for end of 30-day sprint:

| Metric | Target | Where to find |
|---|---|---|
| Instagram followers | +1,500 | IG insights |
| Average saves per post | 40+ | IG insights |
| Share rate per Reel | 5%+ | IG insights |
| `register_interest` signups from IG | 200+ | Admin → Signups (filter by source=instagram) |
| Demo widget views from social | 500+ | Admin → Demo (filter by referrer) |
| A/B CTA winner identified | Yes | Admin → Demo → variant panel |
| npm `etapa-mcp` downloads | 1,000+ | npmjs.com/package/etapa-mcp |
| MCP demo video views | 5,000+ | YouTube + IG Reels combined |

**Signal that we're on track:** if *saves* are growing faster than *likes*. Saves = "this was genuinely useful to a real rider." That's the brand we want.

---

## Section 9 — What to do if we get zero traction in week 1

Don't panic. Do this:

1. **Cut reach-focused content, double engagement-focused content.** Comment on 30 beginner-cycling accounts' posts with thoughtful replies (not just emojis).
2. **Ask directly.** Post a Story: "What's stopping you cycling right now?" Act on the responses.
3. **Find 3 micro-influencers (5k-50k followers, beginner/women niche).** DM them with a genuine offer — free lifetime Etapa + we'll send them a custom plan.
4. **Post a Reddit r/cycling thread about the MCP** (not salesy — as the dev, genuinely asking for feedback). Quality-gated audience.
5. **Cross-post every Reel to TikTok and YouTube Shorts** — same content, 3x the surface area.

---

## Section 10 — The cross-references

This doc is meant to live alongside:

| Doc | When to consult |
|---|---|
| [`CONTENT_PLAYBOOK.md`](./CONTENT_PLAYBOOK.md) | The marketing index. Start here at the beginning of any session. |
| [`BRAND.md`](./BRAND.md) | Every time you're unsure if a piece of content is on-voice. |
| [`HOLO_STRATEGY.md`](./HOLO_STRATEGY.md) | Every Sunday production session. |
| [`MARKET_RESEARCH.md`](./MARKET_RESEARCH.md) | When writing audience-facing copy. Remind yourself who we're NOT for. |
| [`SEO_CONTENT_STRATEGY.md`](./SEO_CONTENT_STRATEGY.md) | When a Reel needs a blog post to drive to. |
| [`mcp-server/PLAN.md`](./mcp-server/PLAN.md) | When creating MCP / product-pillar content. |

---

## Section 11 — Change log

- **2026-04-20** — First version. Researched live against Cyclingnews, Cyclist, Cycling Weekly, ROUVY, Modash, Favikon, Samsara Cycle, Display Purposes, best-hashtags.com, newengen.com, invideo.io, planable.io, later.com. Synthesised with BRAND.md, MARKET_RESEARCH.md, SEO_CONTENT_STRATEGY.md, HOLO_STRATEGY.md, CONTENT_PLAYBOOK.md. Ready to execute.

---

## Sources (where the trend data came from)

- [The rise of the cycling influencer — Cyclingnews](https://www.cyclingnews.com/cycling-culture/the-rise-of-the-cycling-influencer-how-gen-z-and-millennial-riders-are-bringing-cycling-to-the-social-media-generation/)
- [Cycling Fashion Trends 2026 — Samsara Cycle](https://www.samsara-cycle.com/en-us/blogs/inspo-to-love-your-ride/cycling-trend-predictions-2026)
- [Top Instagram Reels Trends — Later](https://later.com/blog/instagram-reels-trends/)
- [Instagram Reels Guide 2026 — InVideo](https://invideo.io/blog/instagram-reels-guide/)
- [Instagram Trends April 2026 — NewEngen](https://newengen.com/insights/instagram-trends/)
- [20 popular Instagram Reels trends — Planable](https://planable.io/blog/instagram-reels-trends/)
- [Best #cycling hashtags — best-hashtags.com](https://best-hashtags.com/hashtag/cycling/)
- [Best #womencycling hashtags — best-hashtags.com](https://best-hashtags.com/hashtag/womencycling/)
- [Top 20 Cycling Influencers — Favikon](https://www.favikon.com/blog/top-cycling-influencers)
- [Cycling Instagram Influencers 2025 — ridecyclonix.com](https://ridecyclonix.com/blogs/news/cycling-instagram-influencers-2025)

---

# Part 3 — Holo production playbook

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

---

# Part 4 — SEO content strategy

## TL;DR

Major cycling apps (TrainerRoad, Wahoo SYSTM, TrainingPeaks, Zwift) have **saturated** performance-optimisation content — training zones, FTP, cadence, periodisation. They have **completely ignored** the content needs of beginners, women, and people returning to cycling. Every content gap identified below is high-volume, low-competition, and perfectly aligned with Etapa's positioning.

---

## What Competitors Already Own (Don't Bother)

- Training zone frameworks and FTP testing
- Cadence optimisation
- Structured training block periodisation
- Race-day nutrition for long events
- Group ride etiquette (advanced)
- Bike maintenance for experienced riders
- Cycling performance research/science

---

## Competitor Content Profiles

| Competitor | Content Focus | Beginner Content? | Women-Specific? |
|---|---|---|---|
| **TrainerRoad** | Training load, FTP, research-backed methodology | ❌ Assumes prior knowledge | ❌ None |
| **Zwift** | Indoor training, training zones, gamification | Partial (very narrow) | ❌ None |
| **Wahoo SYSTM** | Lifestyle, multimedia, some motivation | ❌ | ❌ |
| **TrainingPeaks** | Data analytics, coach-athlete comms | ❌ B2B-first | ❌ None |
| **Strava** | Segments, leaderboards, social comparison | ❌ Can harm beginner psychology | ❌ None |

**Key finding:** No competitor has created content addressing psychological barriers, confidence-building, women's safety concerns, or inclusive cycling identity. These are Etapa's to own.

---

## The 5 Core Content Gaps

### 1. The Confidence & Identity Gap
New cyclists — especially women — struggle with *feeling like a cyclist*, not with technical skill. No platform addresses imposter syndrome, gatekeeping, or identity formation.

### 2. The Women-Specific Vacuum
Women's barriers are structural (infrastructure, safety, culture), not just technical. No training platform can critique cycling culture because they're invested in it. Etapa can.

### 3. The "Where Do I Even Start?" Gap
Beginners can't find foundational answers: "how far should I ride?", "what gear should I use going uphill?", "is my soreness normal?" Content exists but is scattered and jargon-heavy.

### 4. The Psychological Barriers Gap
Fear of traffic, imposter syndrome, anxiety about group rides, shame about slowness — major platforms ignore these entirely because their users have already overcome them.

### 5. The Return-to-Cycling Gap
TrainerRoad covers "regaining fitness after a training break" — but this misses people returning after 5–20 years, illness, injury, or major life changes. Completely different emotional needs.

---

## 30 Article Opportunities

### Tier 1: Highest Priority (beginner fundamentals, high volume)

| # | Title | Target Keyword | Why Competitors Miss It |
|---|---|---|---|
| 1 | How Far Should I Ride as a Beginner? Real Distances for Real People | `beginner cycling distance`, `how far can beginner ride` | Platforms give distance data for trained athletes; beginners need time-based guidance |
| 2 | The Complete Beginner's First Month: What to Expect Week by Week | `beginner cycling first month`, `how to start cycling schedule` | No platform covers the pre-training phase where beginners just need comfort |
| 3 | Your Body After the First Week of Cycling: What Soreness Is Normal | `muscle soreness after cycling beginner`, `cycling DOMS beginner` | Platforms assume athletes expect soreness; beginners interpret it as failure and quit |
| 4 | The Beginner's Guide to Shifting Gears: Why You're Grinding and How to Stop | `how to use bike gears`, `beginner bike shifting` | All gear content assumes prior knowledge; beginners search "why is my bike making grinding noise" |
| 5 | Your First Bike: How to Actually Choose Without Becoming Paralysed by Options | `how to choose first bike`, `what bike should I buy as beginner` | Competitor content assumes you know what type of cycling you want to do |
| 6 | Beginner's Gear Anxiety: What You Actually Need vs. What Marketing Tells You | `beginner cycling gear essential`, `beginner cycling what to buy first` | Premium platforms assume gear investment; beginners ask "can I start with normal clothes?" |
| 7 | I've Never Been on a Bike as an Adult — Am I Too Old to Learn Cycling? | `learn cycling as an adult`, `too old to learn cycling` | Platforms assume reader already identifies as a cyclist |
| 8 | How to Build a Cycling Routine That Actually Sticks | `cycling routine beginner`, `beginner cycling habit building` | Training plans assume motivation exists; habit formation is ignored |
| 9 | Bike Maintenance You Actually Need to Do vs. Bike Maintenance That Can Wait | `beginner bike maintenance`, `basic bike maintenance beginner` | Comprehensive guides assume more technical knowledge than beginners have |
| 10 | The Beginner's Hydration and Nutrition Guide: Fuelling Rides Without Overthinking | `beginner cycling nutrition`, `what to eat before cycling` | Platforms provide detailed sports nutrition for trained athletes; beginners need "should I eat before a 30-minute ride?" |

### Tier 2: Women & Inclusion (strong differentiation)

| # | Title | Target Keyword | Why Competitors Miss It |
|---|---|---|---|
| 11 | Solo Cycling as a Woman: Safety, Confidence, and Finding Your Independence | `women cycling alone`, `women solo cycling safety` | Gender-neutral platforms can't address gender-specific safety concerns |
| 12 | Women's Cycling: Why Infrastructure — Not Fitness — Determines Your Participation | `women cycling barriers`, `why women don't cycle` | Training apps can't critique infrastructure; they're part of the status quo |
| 13 | Cycling Anxiety and Traffic: Practical Strategies for Riding Confidently Among Cars | `cycling anxiety traffic`, `scared to cycle on roads` | Platforms treat anxiety as a skill problem; it's a psychological problem |
| 14 | Beginner's Fear of Group Rides: What Really Happens on Your First Group Ride | `beginner group ride anxiety`, `first group ride cycling` | Group ride content assumes commitment; beginners need psychological preparation first |
| 15 | Red Flags in Cycling Culture: Navigating Gatekeeping and Toxic Fitness Culture | `cycling gatekeeping`, `toxic cycling culture` | Platforms can't critique the culture they are part of |
| 16 | I Don't Like Competition — Can I Just Ride for Fun? Cycling Beyond Performance | `recreational cycling`, `cycling for fun not competition` | Training platforms exist to optimise performance, can't validate non-competitive cycling |
| 17 | Cycling Clothing: Looking Like You Know What You're Doing (Even If You Don't) | `beginner cycling clothes`, `what to wear for cycling beginner` | Clothing content is technical; beginners ask "will people judge my clothes?" |
| 18 | Plus-Size Cycling: Gear, Confidence, and Finding Your Community | `plus size cycling`, `cycling larger bodies` | Cycling imagery is dominated by thin athletes; zero inclusive content exists |
| 19 | Cycling as a Marginalised Body: Resources for BIPOC Cyclists | `BIPOC cycling`, `people of color cycling community` | Major platforms are structurally white and upper-class; never address this |
| 20 | Cycling in Different Body Situations: Pregnancy, Postpartum, and Menopause | `cycling while pregnant`, `cycling during menopause` | Sex-specific topics gender-neutral platforms won't touch |

### Tier 3: Psychology & Motivation

| # | Title | Target Keyword | Why Competitors Miss It |
|---|---|---|---|
| 21 | The Beginner's Mental Game: Overcoming Imposter Syndrome in Cycling Spaces | `imposter syndrome cycling`, `don't feel like a real cyclist` | Users of major platforms have already resolved identity questions |
| 22 | Cycling and Mental Health: Why Your New Bike Might Be Your New Therapist | `cycling mental health benefits`, `cycling depression anxiety` | Platforms optimise for physical metrics; mental health is peripheral |
| 23 | The Beginner's Relationship with Speed: Why Slower Isn't Failure | `slow cycling okay`, `beginner cycling speed anxiety` | Performance culture implicitly devalues slow riding |
| 24 | I Just Fell Off My Bike — Now What? Beginner's Guide to Minor Crashes | `fell off bike beginner`, `minor bike crash what to do` | Post-crash content is about skill; beginners need triage guidance and reassurance |
| 25 | Building a Beginner Cycling Community When Your Friends Think You're Weird | `beginner cycling community`, `find cycling friends` | Community building is tangential to training apps |

### Tier 4: Niche but Ownable

| # | Title | Target Keyword | Why Competitors Miss It |
|---|---|---|---|
| 26 | Cycling Safety: Helmet Fit, Visibility, and Routes — What Actually Protects You | `cycling safety beginner`, `helmet fit guide` | Safety content focuses on riding skill, not route choice and visibility |
| 27 | Back Pain While Cycling: The Bike Fit Issues Most Beginners Ignore | `back pain cycling beginner`, `why back hurts after cycling` | Bike fit is positioned as performance tool, not pain management |
| 28 | Cycling After Injury or Illness: Getting Back on the Bike Safely | `cycling after surgery`, `return to cycling after illness` | Platforms address "regaining fitness after training break" — completely different from post-illness return |
| 29 | Cycling After Weight Loss: Identity, Body Image, and Celebrating Your Changing Body | `cycling weight loss`, `cycling body image` | Platforms discuss fitness gains; no one addresses psychological experience of body change |
| 30 | Cycling as Activism: Using Your Bike as Political Action and Community Building | `cycling activism`, `cycling as transportation` | Training platforms are deliberately apolitical; progressive audience goes unserved |

---

## Content Principles for Every Article

1. **Zero jargon** — no FTP, TSS, VO2 max, watts, periodisation. Ever.
2. **Permission-giving, not optimisation** — "you're doing great, keep going" not "here's how to improve"
3. **Validate psychological barriers** — fear, shame, imposter syndrome are real problems, not weaknesses
4. **Feature diverse cyclists** — different ages, body types, backgrounds, identities
5. **Explicitly anti-gatekeeping** — make it clear Etapa welcomes everyone
6. **Consistency over performance** — a short ride is a win; never position slow as failure

---

## Implementation Priority

**Publish first (highest traffic, clearest gap):**
1. How Far Should I Ride as a Beginner?
2. The Complete Beginner's First Month
3. Your Body After the First Week of Cycling
4. How to Shift Gears (jargon-free)
5. Solo Cycling as a Woman

**Publish second (differentiation cluster):**
- Women's cycling barriers article
- Imposter syndrome
- Cycling anxiety + traffic
- First group ride fears
- Cycling clothing

---

## Note on Firecrawl

`.mcp.json` is now configured at the project root with Firecrawl. In a new Claude Code session, `mcp__firecrawl__*` tools will be available to crawl competitor blogs directly and extract their actual article lists for more precise gap analysis.
