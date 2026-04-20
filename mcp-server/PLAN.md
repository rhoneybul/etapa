# Etapa MCP — Release & Marketing Plan

> Persistent context for cross-session work. Update the status column as things ship.
> Last meaningful update: April 2026 (launch week).

---

## TL;DR — where we are

- ✅ **Etapa MCP is published** — npm (`etapa-mcp@0.1.3`), official MCP Registry (`io.github.rhoneybul/etapa-mcp`), Railway (`etapa-mcp-production.up.railway.app`).
- ✅ **Two tools live:** `generate_training_plan` (hits Etapa API) and `cycling_beginner_guide` (local content).
- ✅ **Launch blog post published** at `getetapa.com/blog/etapa-mcp-launch`.
- ✅ **Website has a "Use Etapa in any AI assistant" section** at `getetapa.com/#mcp`.
- ✅ **CI automation complete** — auto-publish on `[release patch]` commit or `mcp-v*` tag, provenance, syncs npm with `server.json`.
- 🚧 **Community distribution** — in progress (see table below).
- ⏳ **Social launch** — not started yet (video, Twitter thread, Reddit, Show HN).

---

## Strategic context

### Why the MCP exists

Etapa is a consumer iOS app (launching soon) aimed at beginner cyclists, women getting into cycling, and returning riders. Most competitor apps are aimed at experienced cyclists and speak in jargon (FTP, TSS, zone 2). Etapa is built to open the gate.

The MCP is a **pre-launch marketing move** with four benefits:

1. **Distribution** — gets Etapa in front of technically-minded early adopters (who often know someone non-technical who cycles) before the App Store listing is live.
2. **Proof** — anyone can experience the quality of our training plans via their own AI assistant. No download, no account.
3. **Trust signal** — "this team shipped an MCP before launching" reads credibly to developers + media.
4. **Attribution** — every tool call ends with "download Etapa at getetapa.com" and drives signups.

**Strategic position:** The MCP is free forever. The full app (24-week plans, live coach chat, Strava sync, progress tracking) is the paid product. The MCP is a **taste**, not a competitor.

### Target audience (in order of priority)

1. MCP-curious developers who follow AI tooling
2. Cyclists who also follow AI (overlap is smaller but high-intent)
3. Cycling-curious non-cyclists who use AI assistants daily (long-tail, biggest volume)

### What "success" looks like

Near-term (4 weeks from launch):
- 500+ npm downloads
- 100+ installs in Claude Desktop (proxy: npm download count spiking around app launch)
- 3+ directory listings (mcp.so, Glama, Smithery)
- 1 Reddit post with 50+ upvotes OR 1 Show HN with 50+ points
- 50+ email registrations of interest traced to MCP source (via `?source=mcp` UTM)

Medium-term (3 months):
- Top 50 ranked on MCP Registry by usage
- Listed in at least 5 directories
- Mentioned in at least 1 AI newsletter or blog post we didn't write
- 200+ email registrations from MCP users

---

## Distribution checklist

Status key: ✅ done · 🚧 in progress · ⏳ planned · ❌ rejected / skipped

| # | Channel | Status | URL / Notes |
|---|---|---|---|
| 1 | Official MCP Registry | ✅ | [registry link](https://registry.modelcontextprotocol.io/v0/servers/io.github.rhoneybul/etapa-mcp) |
| 2 | npm | ✅ | [npm page](https://www.npmjs.com/package/etapa-mcp) · v0.1.3 |
| 3 | Railway HTTP endpoint | ✅ | `etapa-mcp-production.up.railway.app/mcp` |
| 4 | Etapa blog launch post | ✅ | `getetapa.com/blog/etapa-mcp-launch` |
| 5 | Etapa homepage section | ✅ | `getetapa.com/#mcp` |
| 6 | Glama.ai | 🚧 | Initially rejected (README missing at repo root). Root README + LICENSE added; resubmit. |
| 7 | mcp.so | ⏳ | Form: `mcp.so/submit`. Use medium description. |
| 8 | Smithery | ⏳ | `smithery.ai`. Connect GitHub, reads `server.json`. Adds one-click install. |
| 9 | PulseMCP | ⏳ | Form or DM `@PulseMCP`. Lower priority. |
| 10 | modelcontextprotocol/servers (GitHub README list) | ❌ | **Officially retired.** The repo's README now explicitly says "that list has been retired in favor of the MCP Server Registry" — which we're already in. Do not submit. |
| 11 | awesome-mcp-servers (GitHub list) | ❌ | Same reasoning. Skip unless bored. |
| 12 | Cursor directory (`cursor.directory`) | ⏳ | Low priority unless we get Cursor users asking. |
| 13 | Reddit `r/ClaudeAI` | ⏳ | Post Tuesday/Wednesday 8-10am PT. Post body in `.submission-pack.md`. |
| 14 | Reddit `r/mcp` | ⏳ | Same post, slightly trimmed. Do 1 day after `r/ClaudeAI`. |
| 15 | Show HN | ⏳ | Title + first comment ready in `.submission-pack.md`. Post Tue-Thu 8-10am PT. |
| 16 | Anthropic Discord `#mcp` | ⏳ | One post, one link, no spam. |
| 17 | Twitter/X thread | ⏳ | 4-tweet thread in `.submission-pack.md`. |
| 18 | Instagram reel (60s demo) | ⏳ | Record with OBS or Screen Studio. Claude Desktop screen capture. |
| 19 | YouTube Short (same content) | ⏳ | Cross-post from Instagram reel. |
| 20 | ProductHunt launch | ⏳ | **Save for iOS app launch day** for compound effect. |
| 21 | AI newsletter outreach | ⏳ | Aim at: Ben's Bites, Stratechery (probably too big), Latent Space, Every. |

### Prioritisation logic

**Do now** — the ones that move the needle with least effort:
- Glama resubmission (5 min)
- mcp.so (5 min)
- Smithery (10 min, adds one-click install — big conversion win)
- Twitter/X thread (5 min)

**Do this week** (needs timing + engagement budget):
- Reddit `r/ClaudeAI`
- Show HN
- Anthropic Discord
- 60-second demo video

**Reserve for app launch day** (compound impact):
- ProductHunt
- Press outreach
- Major social push

**Skip entirely** (diminishing returns):
- `modelcontextprotocol/servers` GitHub PR — **officially retired** (confirmed by a notice in their README: "that list has been retired in favor of the MCP Server Registry"). Not just low leverage, genuinely deprecated. Do not submit.
- `awesome-mcp-servers` GitHub PR — legacy curation list, low ongoing maintenance. Skip unless bored.

---

## The product itself — what might we add?

Current state: 2 tools. Ideas for v0.2+, ranked by marketing impact × implementation effort.

### Shipped in v0.2.0 (April 2026)

- ✅ **`ask_cycling_coach`** — general coaching Q&A. Calls `/api/public/coach-ask`.
- ✅ **`review_cycling_plan`** — critique any existing cycling plan. Calls `/api/public/review-plan`.
- ✅ **UTM tracking on download links** — `?utm_source=mcp&utm_medium=tool&utm_campaign=<tool-name>` baked into every response.

### Likely next additions (high leverage)

- **`suggest_coach`** — based on style preferences, recommends one of Etapa's 6 AI coaches. Drives app downloads via coach chemistry. Good candidate for v0.3.
- **Analytics logging** — Supabase table recording tool calls (anonymised: timestamp, tool, source, fitnessLevel). Lets us actually measure adoption.
- **Rate-limiting on the public API endpoints** — the coach-ask/review-plan endpoints are currently un-rate-limited. Fine for now but worth adding per-IP throttling before traffic grows.

### Possibly useful

- **`recommend_bike`** — first-bike recommendation given budget + use case + hills.
- **`assess_training_load`** — given a text description of recent rides, flags overtraining.
- **Stronger JSON Schema** — typed `structuredContent` so MCP clients can render plans as UI components, not just markdown.
- **Conversation memory** — currently each tool call is stateless. Future: session-aware tools that remember prior questions within a chat.

### Probably not worth it

- Scope creep towards real coaching (gets into "is this the app?" territory)
- Premium / paid tiers (the MCP exists to drive app downloads, not replace them)

---

## Technical state

### What's built

- **Repo:** `github.com/rhoneybul/etapa` (monorepo)
- **MCP code:** `/mcp-server/` — Node 20+, `@modelcontextprotocol/sdk`
- **API backend:** `/server/` — Node.js on Railway at `etapa.up.railway.app`; endpoint `POST /api/public/sample-plan` (public, no auth, capped at 4 weeks)
- **Transports:** stdio (via `npx -y etapa-mcp`) + Streamable HTTP (via `etapa-mcp-production.up.railway.app/mcp`)
- **CI:** `.github/workflows/mcp-ci.yml` (lint + boot test on push) + `.github/workflows/mcp-publish.yml` (auto-publish on tag or `[release *]` commit)
- **Auto-deploys:** Railway auto-deploys MCP on push to main when `mcp-server/**` changes. npm auto-publish via workflow_dispatch or tag.
- **Versioning:** `package.json` + `server.json` kept in sync. CI reads npm state to prevent version collisions.

### Known issues / TODO

- [ ] `server.json` version gets out of sync with `package.json` on manual releases. CI could auto-sync it when publishing. Not urgent.
- [ ] Release descriptions hit 100-char limit occasionally. Add a pre-commit check?
- [ ] Custom subdomain — `mcp.getetapa.com` instead of `etapa-mcp-production.up.railway.app`. Cleaner for socials. 5-min Railway + DNS job.
- [ ] Set up `MCP_PROD_URL` GitHub secret to enable the post-deploy health probe in CI.
- [ ] Analytics not wired — no idea how many tool calls/day are happening.

### Env / secrets already set

- `NPM_TOKEN` (GitHub secret) — granular access for `etapa-mcp` only
- `EXPO_TOKEN` (GitHub secret) — for app publish workflow (not MCP)
- Railway env vars on MCP service: `ETAPA_API_URL`, `MCP_AUTH_TOKEN` (empty = public), `NODE_ENV`

### Quick health checks

```bash
# Hosted MCP healthy?
curl https://etapa-mcp-production.up.railway.app/health

# Published npm version?
npm view etapa-mcp version

# Registry entry?
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=etapa" | python3 -m json.tool
```

---

## Writing & voice rules

Every piece of public copy about the MCP should pass these checks:

1. **Plain English.** No FTP, TSS, zone 2, VO2max. If the iOS app wouldn't say it, the MCP shouldn't either.
2. **Beginner-positive.** Never implies the reader "should already know" anything.
3. **Honest about the taste/menu distinction.** The MCP is free. The full experience is the app. Say so openly — never hide it.
4. **Not tech-bro.** Don't make "AI" the hook. Make **cycling** the hook, AI the enabler.
5. **"We built this" over "Etapa lets you"** — active voice, personal, not corporate.
6. **Links and a CTA at the end of every piece** — register interest, GitHub, npm.

### Approved tagline options

- *"Ask any AI assistant for a cycling training plan."*
- *"Your cycling coach, now in every AI."*
- *"Start riding. We'll handle the rest — from inside Claude."*
- *"Cycling's always been gatekept. AI just opened another gate."*

### Rejected (don't use)

- ❌ "Revolutionary AI-powered…"
- ❌ "The first MCP for cycling" (nobody cares)
- ❌ "Leverage the power of…"
- ❌ Anything with "unlock", "supercharge", "transform"

---

## Copy library

Paste-ready text for everywhere. Keep these short and consistent.

### 1-liner

> AI cycling coach, now in every AI assistant. Free, no account. `npx -y etapa-mcp`.

### 100-char description (mcp.so, directories)

> AI cycling coach — training plans and beginner guidance via the Etapa API.

### 250-char description (longer forms)

> Etapa is an AI cycling coach for beginners. The MCP exposes two tools: `generate_training_plan` (2-4 week plans powered by the Etapa API) and `cycling_beginner_guide` (advice on bikes, gear, safety). Free, no account.

### Tweet opener

> Every AI assistant can now build you a cycling training plan.
>
> We shipped Etapa as an MCP today. Free, no account, no jargon.
>
> npx -y etapa-mcp → any Claude Desktop, Cursor, or MCP client.
>
> Why we did this → getetapa.com/blog/etapa-mcp-launch

### Reddit title (`r/ClaudeAI`)

> I made an MCP for generating cycling training plans — feedback welcome

### Show HN title

> Show HN: Etapa – an MCP server that generates cycling training plans

### Email to newsletter operators

> Subject: A new MCP that might fit your readership
>
> Hi [name],
>
> Long-time reader. I've just published Etapa, an MCP server that gives AI assistants (Claude Desktop, Cursor, etc.) a cycling training plan generator + beginner guide. Built for beginners — no jargon, no FTP, no zone charts. Free, no account.
>
> Was thinking it could fit a round-up piece if you're doing AI tools / new MCPs. Demo in a Claude chat takes about 30 seconds and the output is genuinely readable, not a wall of data.
>
> Links: npm + GitHub + blog post with the backstory.
>
> No pressure either way — just wanted to put it on your radar. Happy to answer anything.
>
> Rob (getetapa.com)

---

## Session checkpoints

Log meaningful state changes here. Keep it terse.

- **2026-04-20** — MCP live on npm, Registry, Railway. Blog post published. Website section live. Glama rejected for missing root README → fixed with root README + LICENSE. CI publish workflow proven working.
- **2026-04-20 (later)** — v0.2.0 shipped: added `ask_cycling_coach` (open-ended Q&A) and `review_cycling_plan` (critique any plan). Two new public API endpoints (`/api/public/coach-ask`, `/api/public/review-plan`) use Claude Haiku with Etapa voice system prompt + marketing tail. All 4 tools now wired in MCP; server.json + package.json + root README + mcp-server README + website section all updated. Description slimmed to 95 chars to stay under registry limit.

---

## Decision log

Key strategic calls made, so future-me doesn't second-guess them:

- **MCP is free forever, no paid tier planned.** Goal is app downloads, not MCP revenue.
- **Plans capped at 4 weeks.** Forces the "sample / taste" framing and keeps the app as the upgrade.
- **Monorepo with sub-path, not separate repo.** Slightly more friction for directory scrapers (Glama issue), but simpler to maintain. Solved with root README.
- **stdio + HTTP both supported.** Lower the barrier for different client types. HTTP is hosted on Railway alongside the main API (separate service, Nixpacks).
- **Official MCP Registry is primary.** Old `modelcontextprotocol/servers` GitHub list not worth the PR.
- **Smithery is high-leverage.** Their one-click install removes friction for Claude Desktop users.
- **Save ProductHunt + big press push for iOS app launch day** for compound effect, don't burn powder now.

---

## Context for next session

If starting a fresh Claude/Cursor session, skim these first:

1. **This file** (`/mcp-server/PLAN.md`) — strategic state
2. **`/mcp-server/README.md`** — tool reference + install docs
3. **`/mcp-server/.submission-pack.md`** — copy-paste text for every submission
4. **`/mcp-server/.github-pr-draft.md`** — (legacy, skip — GitHub community list deprioritised)
5. **`/CLAUDE.md`** at repo root — project overview + brand voice

The three files above are **persistent context**. The conversation history in any individual Claude session is not — always re-read these first.
