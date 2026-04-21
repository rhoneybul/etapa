# Etapa — Design & UX Strategy

How we design Etapa to feel like a product worth paying for, specifically for beginners getting into cycling.

## Design principles

Six principles, drawn from studying $10M+ sports/wellness apps (Strava, Whoop, Peloton, Apple Fitness+, Calm, Headspace). These should settle any design debate.

1. **Show value before asking for work.** Users see a real outcome as early as possible — a sample plan, a specific "today's ride," a real coach message — before committing to another form field.
2. **Celebrate the effort, not the data.** Beginners are not intrinsically motivated by FTP graphs. They are motivated by "you did the thing, and that mattered." Every completion, streak, and milestone gets a moment.
3. **Personality over polish.** The coach is not a chatbot — she's Clara, or Lars, or Tom. Everything they say sounds like them. Generic copy is banned from anywhere a coach is involved.
4. **One "do this now" per screen.** Home answers "what am I doing today?" The paywall answers "which tier?" The coach chat answers "what should I ask?" No screen should have three primary CTAs of equal weight.
5. **Beginner-safe by default.** No jargon (FTP, TSS, VO2max, W/kg) appears unless the user asks. Defaults assume someone on their second month, not their tenth year.
6. **Friction is only justified by clarity.** If a step doesn't make the plan measurably better for the user, it shouldn't exist. Every onboarding step must earn its screen.

## What's shipped

Three improvements landed in this pass, all mapped to principles 1–3:

- **SignInScreen benefit chips** — three pink pills under the tagline that answer "what does this app do" in three words each. Principle 1.
- **HomeScreen "today" hero card** — magenta-accented card above the week strip with a loud "See session" CTA and a secondary "Ask {coachName}" button. Three states: active, rest day, done. Principle 4.
- **WeekViewScreen week-completion celebration** — animated overlay with coach-voiced one-liner when the user finishes the last session of a week. Principles 2 and 3.

## Outstanding recommendations, ranked

### Tier 1 — critical, next session

**Reorder PlanConfig: build the week first.** The current 7-step wizard asks "which day is your long ride?" before the user has any mental model of what a week looks like. Reorder so the week grid appears at step 2, with sessions visually placed. The user then fine-tunes (long ride day, coach, dates) with visual confirmation. Replace "Step 5 of 7" with a progress arc and "Nearly there — 2 screens left."
*Effort: L · Impact: critical — directly affects funnel completion and `plan_funnel_abandoned` on PlanConfig.*

**Coach chat empty state rework.** Current empty state is a generic chatbot panel. It should feel like starting a conversation with Clara (or whoever they chose). Show the coach's avatar + name + one-line tagline ("Clara · Warm and encouraging") front and centre. If Strava is connected, the first starter prompt should reference their actual ride: *"I see you rode 52 km on Monday — how'd it feel?"*. Add a soft "Learn more about coaching" link that sets expectations.
*Effort: M · Impact: high — coach chat is the product's differentiator.*

### Tier 2 — valuable, post-beta

**Progress bar upgrade on WeekViewScreen.** "2/5 sessions done" undercounts the work — a beginner who's done 60 km feels exhausted but sees "only 40% done." Show load metrics: *"120 km · 15 hrs · Week 3 of 8."* Accompany with a visual arc showing build → deload over the plan's lifetime.
*Effort: M · Impact: medium — affects daily engagement sentiment.*

**Deload week treatment.** Currently a small grey "Recovery week" badge. A deload should *feel* intentional — a full card-background shift to a cooler blue, a coach line explaining why ("Week 4 is lighter on purpose. Fitness is built in recovery"), and reduced session-card intensity. Users who don't feel the taper skip it and sabotage their plan.
*Effort: S · Impact: medium — prevents "I feel lazy this week" user anxiety.*

**Coach chat: proactive Strava mentions.** Right now the coach waits for the user to ask. If a user has Strava and rode recently, the first assistant turn (before any user message) should acknowledge the ride. This turns the coach from reactive to present. Requires passing last-ride summary into the system prompt.
*Effort: M · Impact: medium-high — signals intelligence, not just retrieval.*

### Tier 3 — marketing surface

**Website "see it in action" video.** 15–20 second screen-recording montage: beginner nervously opens app → sets a 100km goal → gets personalised plan → completes week 1 → coach sends encouragement. Replace/supplement the current hero. This is the single biggest website conversion lift available.
*Effort: L (production) · Impact: high on website → install conversion.*

**Website trust row.** "Built with Claude AI from Anthropic" + usage count (once accurate) + "Built by a cyclist for cyclists" (or equivalent founder signal). Competitive research shows trust is the biggest barrier for beginners choosing between Etapa and free alternatives like intervals.icu.
*Effort: S · Impact: medium — compound over time as users stack up.*

**Pricing clarity on the website.** Currently £14.99 one-time is buried. Add a compact "starter plan £14.99 — cheaper than one month of TrainerRoad" comparison line. Beginners almost always price-check against bigger names.
*Effort: S · Impact: medium.*

### Tier 4 — quality-of-life

**Paywall dismissal copy.** Current close behaviour is silent. When a user dismisses the paywall, consider a soft "Sure — try free for 7 days?" nudge (but only once per session, and never after they've dismissed it twice — respect matters).
*Effort: S · Impact: low-medium.*

**HomeScreen empty state (pre-plan users).** Currently functional but unemotional. Should have one sentence of warmth: *"Let's build you a plan. Takes 2 minutes."* with a clear CTA.
*Effort: S · Impact: low but easy.*

**Week grid visual rhythm.** Activities currently render as uniform cards. Heavier sessions (long rides, intervals) should visually weigh more — subtle size/opacity variation. This helps users scan their week at a glance and see where the hard days are.
*Effort: M · Impact: medium — specifically improves reference-mode users.*

## Cross-cutting patterns

Rules to apply across every screen we touch going forward.

**Copy voice.** Plain English. Never marketing-speak. A real person saying real things to another real person. Examples of banned phrases: "unlock your potential," "revolutionary," "game-changing." Examples of voice we want: *"Rest day — recovery is training too."* / *"Week 3 done. You're building fitness one session at a time."*

**Coach voice segmentation.** Every piece of copy spoken by the coach should vary based on `planConfig.coachId`. We already do this in the week-completion modal; extend it to any other coach-voiced moment (activity suggestions, check-ins, assessments). Generic coach copy is a bug.

**Celebration weight.** Calibrate celebrations to the real difficulty of what was done. First session → small toast. First week done → full overlay. Final week of a plan → bigger moment + suggested next goal. Do not over-celebrate trivial actions — users quickly learn to dismiss reflexively.

**Empty states.** Every empty state answers two questions: *"What's supposed to be here?"* and *"How do I fill it?"* The best empty states invite rather than instruct. No "No data" labels anywhere.

**Colour discipline.** Magenta (`#E8458B`) is used for primary CTAs, key accents, and the coach identity. Green (`#22C55E`) for success states only. Functional colour on functional UI only — blue for information, amber for caution, red for error. Avoid decorating with colour for the sake of it.

**Animation budget.** Animations should be < 300ms and should serve a purpose (confirm completion, guide attention, show relationship between screens). No animation "just to feel modern."

## What to measure

When we ship each improvement, we should see movement in at least one of these metrics within two weeks of real traffic. If we don't, the improvement was vanity and we revisit.

- **Today hero card** → `coach_chat_opened` rate among users with active plans; session start-rate for today's activity.
- **Week celebration** → D7 retention in the cohort that first hits the modal; `week_completed` event volume.
- **PlanConfig reorder (when shipped)** → `plan_funnel_abandoned` rate at `atScreen: PlanConfig` falls; `plan_generated` rate rises.
- **Coach chat rework (when shipped)** → `chat_message_sent` rate among users who open the chat; `chat_conversation_milestone` at turn 2 rises.
- **Website video (when shipped)** → visit-to-signup conversion rate on the landing page.

If a shipped change moves no metric after two weeks, assume it was the wrong change and roll it back cleanly.

## Design debt to carry forward

Things we're aware of but consciously parking:

- The WeekViewScreen day grid could be a lot more beautiful. We're parking that until we see whether week view or a daily "today" focused flow is the more common pattern in real usage.
- Onboarding currently has no "first ride celebration" — when a user marks their very first session complete across any plan, we should have a different (bigger) moment than a normal completion. Parked until after PlanConfig reorder ships.
- The Strava-connection flow is technically fine but emotionally uninspiring. Once Strava sync reliability is solid (see `TELEMETRY.md` north-star notes), we should revisit and make "connect Strava" feel like an unlock.

## Process note

When proposing new designs or flows, work through these principles in order before shipping: Does it show value earlier? Does it celebrate something real? Does it have personality? Does it have one primary CTA? Is it beginner-safe? Does the friction earn its place? If any answer is "no," iterate until they're all "yes."
