# Etapa — Claude Code Context

## What This Project Is

**Etapa** is an AI-powered cycling training app (iOS + Android) built with React Native / Expo. It generates personalised cycling training plans using Claude (Anthropic) as the AI backbone, and provides an AI coach chat interface. Users connect Strava, set a goal, and get a structured plan with a conversational AI coach.

- App Store: `com.etapa.app`
- Version: 0.95.11 (build 116)
- Backend: Node.js server hosted on Railway (`https://etapa-production.up.railway.app`)
- Database: Supabase
- Auth: Supabase + Apple Sign-In
- Payments: RevenueCat (react-native-purchases)
- Analytics: PostHog + Sentry
- Static website: `/website/index.html` (hosted on Vercel)

## Tech Stack

- **Framework:** React Native + Expo (managed workflow)
- **Navigation:** React Navigation (stack)
- **Styling:** StyleSheet (no Tailwind — inline styles throughout)
- **AI:** Anthropic Claude API (plan generation + coach chat) — see `src/services/llmPlanService.js`
- **Backend API:** `src/services/api.js`
- **Strava:** `src/services/stravaService.js` + `stravaSyncService.js`
- **Storage:** AsyncStorage + Supabase
- **Fonts:** Poppins (expo-google-fonts)

## Key Screens

| Screen | Purpose |
|---|---|
| `GoalSetupScreen` | User sets event goal, distance, date |
| `PlanConfigScreen` | Days available, sessions per week |
| `PlanLoadingScreen` | AI generates plan (calls Claude) |
| `PlanOverviewScreen` | Full plan view with phases |
| `WeekViewScreen` | Current week's sessions |
| `CoachChatScreen` | AI coach chat interface |
| `ChangeCoachScreen` | Pick from 6 AI coach personas |
| `BeginnerProgramScreen` | 12-week beginner programme |
| `PaywallScreen` | Subscription/purchase |

## AI Coaches (6 personas)

1. **Clara Moreno** — Warm, patient & encouraging *(recommended for beginners)*
2. **Sophie Laurent** — Science-backed, no fluff *(recommended for beginners)*
3. **Elena Vasquez** — Race-day strategist
4. **Lars Eriksen** — No-nonsense & direct
5. **Matteo Rossi** — Chill but focused
6. **Tom Bridges** — Casual riding buddy

## Pricing (GBP)

- **Starter** — £14.99 one-time, 3 months access (beginner pick)
- **Monthly** — £7.99/month
- **Annual** — £49.99/year (~£4.17/month)
- **Lifetime** — £99.99 one-time (launch special)
- All subscriptions include 7-day free trial

## Brand & Positioning

Full details in `BRAND.md`. Summary:

- **Primary tagline:** "Start riding. We'll handle the rest."
- **Positioning:** AI cycling coach for beginners, women, and returning riders — NOT for data-obsessed racers
- **Brand idea:** "Cycling has always been gatekept. Etapa opens the gate."
- **Tone:** Warm, plain English, no jargon, no intimidation, science-backed but not showing off
- **Accent colour:** `#E8458B` (warm magenta-pink)

**Target audiences (priority order):**
1. Complete beginners — no structured training background, want to build a habit
2. Women getting into cycling — put off by jargon-heavy, male-skewed culture of existing apps
3. Returning/lapsed riders — had a habit, lost it, want to get back

**Do NOT position toward:** competitive racers, power-meter users, FTP-obsessed athletes, triathletes

## Market Research

Full competitive analysis in `MARKET_RESEARCH.md`. Key points:

- No competitor has a genuine LLM-powered AI coach — 12–18 month lead window
- TrainerRoad ($18/mo), Wahoo SYSTM ($18–20/mo), TrainingPeaks ($12–17/mo) all target intermediate-advanced cyclists with dated UX
- Zwift/Rouvy require $1,500+ hardware — indoor only
- intervals.icu is free but has terrible UX
- Beginner market is ~5x larger than serious cyclist market and almost entirely unserved

## Website

Static site at `/website/index.html` (Vercel). Key sections:
- Hero, How It Works (4 steps), Features, AI Transparency, Coaches, Beginner Program, Screenshot Showcase, Pricing, Testimonials, CTA
- Prices are fetched live from `https://etapa.up.railway.app/api/public/prices`
- Recently updated (April 2026) to target beginners and women — more inclusive language, jargon removed, testimonials added

## Active Work (as of April 2026)

- **SEO content strategy** — finding keyword/content gaps vs competitors to write articles on the website. Firecrawl MCP is configured (see `.vscode/mcp.json`) for competitor crawling. Goal: identify 20–30 article opportunities targeting beginner cyclists and women.
- **Market positioning** — brand and market research complete, written to `BRAND.md` and `MARKET_RESEARCH.md`

## MCP Servers (in `.vscode/mcp.json`)

- **Perplexity** — web research and competitor analysis
- **Firecrawl** — direct website crawling for SEO gap analysis

## Repository Structure

```
/
├── src/
│   ├── screens/       # All app screens
│   ├── services/      # API, AI, Strava, auth, storage
│   ├── components/    # Shared UI components
│   ├── theme/         # Design tokens
│   └── utils/
├── server/            # Node.js backend
├── website/           # Static marketing site
├── supabase/          # DB migrations and config
├── ios/ android/      # Native project files
├── BRAND.md           # Brand guidelines (overview, taglines, audience, tone, style)
└── MARKET_RESEARCH.md # Competitive analysis and positioning
```
