# Etapa — Content & Marketing Playbook

> The one-page index to everything brand, market, content, and distribution.
> Start here when you're starting a marketing session. Everything below links
> out to a dedicated doc when you need depth.
>
> Last updated: April 2026.

---

## Quick navigation

| I want to… | Read |
|---|---|
| Understand the brand voice & tone | [`BRAND.md`](./BRAND.md) |
| Understand the competitive landscape | [`MARKET_RESEARCH.md`](./MARKET_RESEARCH.md) |
| Pick an article to write next | [`SEO_CONTENT_STRATEGY.md`](./SEO_CONTENT_STRATEGY.md) |
| Generate social assets in Holo | [`HOLO_STRATEGY.md`](./HOLO_STRATEGY.md) |
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
