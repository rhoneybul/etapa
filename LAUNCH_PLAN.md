# Etapa — Launch Plan

> **Goal:** real beginner cyclists using the app and giving feedback within **7 days**. Then iterate. Then public launch.
>
> Three phases. Paste-ready outreach copy. Specific channels. Specific success metrics.
>
> Lives alongside [`STRATEGY.md`](./STRATEGY.md) (long-term marketing) and [`THIS_WEEK.md`](./THIS_WEEK.md) (tactical weekly execution).
>
> Last updated: April 2026.

---

## TL;DR

| Phase | When | What | Goal |
|---|---|---|---|
| **Phase 1 — Private beta** | Days 1-7 | 15 hand-picked testers via personal network + warm list | Validate the core loop works for real beginners. Fix what's broken. |
| **Phase 2 — Expanded beta** | Days 8-21 | Scale to 50-75 testers via Reddit, Facebook, Instagram, Strava | Collect testimonials. Find content. Spot retention issues. |
| **Phase 3 — Public launch** | Days 22-35 | App Store launch with beta quotes + 30-day social campaign | 1000+ installs week 1. 40%+ day-7 retention. |

**The whole arc is 5 weeks**, not 3 months. Every week has a concrete deliverable.

---

# Phase 1 — Private Beta (Days 1-7)

**Goal: 15 real beginners using the app by end of week 1.**

Not 100. Not "the waitlist." **Fifteen people you can call by their first name**, who you've personally invited, who will give you real feedback because you asked them to.

## Why small + high-touch wins right now

Large beta programs fail in two ways: either nobody uses the app (fire-and-forget signups), or the feedback is so diluted you can't act on it. A 15-person cohort where **you know each person** gives you:

- Real conversations (not survey data)
- Fast iteration loops (fix something Tuesday, ask them Thursday if it's better)
- Testimonials with names attached
- 5-10 people who will tell their friends organically

## The 15 — where they come from

In priority order. You don't need all of these — just enough to hit 15 accepts.

| Source | Expected accepts | Action |
|---|---|---|
| **Personal network** | 5-7 | Direct DM/text to people who cycle or want to start. See template T1 below. |
| **Register-interest list with "hopes" filled in** | 4-6 | Personal email to every single one who left a hope message. See template T2. |
| **Your girlfriend + her friends** | 2-3 | Direct invite. Their feedback is gold — this is literally your target audience. |
| **One Instagram post** | 2-3 | Post from @getetapa: "We're opening 20 TestFlight spots for beginners." See template T3. |

**Target: 15 accepts. Don't chase 50 in week 1. Depth beats breadth this early.**

## Template T1 — Personal network DM/text

Use this verbatim or adjust for your voice. Send 1:1, not a group message.

```
Hey [name] — building an app called Etapa, an AI cycling coach
for beginners. Specifically NOT for racers or FTP-nerds — for
people who want to get into it without the jargon.

Would you be up for being one of 15 beta testers? Commitment
is pretty light — install the TestFlight app, generate a plan,
do 2-3 rides over the next fortnight, reply to a short
feedback email a week in.

No pressure if it's not your thing. Would love to have you if
you're in.

Rob
```

**Send to:**

- Your girlfriend + any of her cycling-curious friends
- Mates who cycle
- Anyone you know who's said "I've been meaning to start cycling" in the last 6 months
- 1-2 ex-colleagues you know will give you honest product feedback

## Template T2 — Email to the register-interest list (people who left "hopes")

You have a "hopes" field on `interest_signups`. Everyone who filled that in told you *what they want*. Email them personally — reference their hope by name.

```
Subject: Beta-testing Etapa — you're the exact rider we're building for

Hey [first name],

Thanks for registering interest in Etapa a while back. You
mentioned you were hoping for [X] — and you're exactly the
kind of rider I've been building this for.

We're opening 15 spots for a private TestFlight beta. You'd:

  – Install the beta app on iOS
  – Generate a plan for yourself
  – Do a handful of rides over the next 2 weeks
  – Reply to a short feedback email at the end

In return you get:
  – Early access to the full app, free during beta
  – Lifetime free access once we launch
  – Direct line to me (reply to this email) for anything

Want in? Reply "yes" and I'll send you a TestFlight link
today.

Rob
Founder, Etapa
getetapa.com
```

**Do this manually, not as a mail-merge.** Personalise the `[X]` for what they actually said. If they wrote "something for women who hate the gatekeeping" — reference that exactly. People can smell automation.

## Template T3 — Instagram post / story

Post from @getetapa. Image + caption:

**Caption:**
```
Opening 15 TestFlight spots for beginner cyclists.

If you've been meaning to get into cycling — or you've
tried an app and felt out of your depth — this is for you.

Comment "beta" below, or DM me. We'll send you an invite
today.

Etapa — cycling coaching for real people.
Launching on iOS soon.
```

**Image:** use your Post 1 (the editorial "Etapa opens the gate" graphic) — people have seen that associated with the brand now. Familiar visual anchor.

## Pre-flight — before you can accept a single tester

Four things must be ready. Don't open the beta until they're all green.

- [ ] **TestFlight build is live** — via `eas build --platform ios --profile preview` + `eas submit --platform ios --latest`. Then go to App Store Connect → TestFlight → add your own Apple ID as a tester, install, verify it opens.
- [ ] **A clean first-ride experience** — from fresh install to "my plan is ready" should take <3 min with no broken states. Test this yourself.
- [ ] **A way to invite people to TestFlight** — public link via App Store Connect → TestFlight → Public Link. Or manual invites by email.
- [ ] **A feedback inbox that's not just your personal email** — create `beta@getetapa.com` (or similar) and auto-forward to you. Lets testers reply to a branded address.

If one of those isn't ready, fix it today. Beta can't start until it is.

## Onboarding email for accepted testers (day 0)

Sent the moment someone says "yes."

```
Subject: You're in — Etapa beta + what to expect

Hey [first name],

Welcome to the Etapa beta. You're one of 15.

### Installing the app
1. Open this TestFlight link on your iPhone: [link]
2. Install the Etapa beta when prompted
3. Open it and set up your plan (takes 90 seconds)

### What I'd love from you
– Do at least 2 rides over the next 2 weeks using the plan
– Message the coach in the app at any point — ask anything
– Reply to this email any time with anything: bugs, confusion,
  "this is great," "this is terrible"
– At the end of 2 weeks I'll send you a short 5-question
  feedback form. That's the only structured ask.

### Your direct line
Reply to this email — I personally read everything.

### Your reward (whenever we launch)
Free lifetime access to the full app. You're helping
me ship it; that's how it should work.

Thanks for doing this. Seriously — knowing you're going to
actually use it is what's keeping me focused this week.

Rob
```

## First-48-hours support SLA

This is where most betas fail. Riders hit a wall on Tuesday and by Thursday they've forgotten about the app. Don't let this happen:

- **Reply to every message within 2 hours during waking hours** for the first 48h after each tester joins
- **If someone hasn't opened the app 24h after accepting** → send a one-liner: *"All set with the install? Hit me with anything if stuck."*
- **If someone messages the in-app coach** → you see it in the admin dashboard, don't let it sit

These first 48h determine whether they become a real user or a ghost.

## The 3 questions that actually matter at end of week 1

Keep structured feedback tight. After 7 days, email each tester:

```
Quick 3-question check-in. Just reply — no form.

1. What's the ONE thing that felt off / confusing / missing?

2. What made you actually open the app again after the first
   time (if you did)?

3. On a scale of 0-10, how likely are you to tell a friend
   who's getting into cycling about Etapa?

That's it. Reply in one message, whatever depth feels right.
```

Three questions chosen deliberately:

- **Q1** = your top product bug / UX priority for the week
- **Q2** = what's working (your marketing angle, probably)
- **Q3** = Net Promoter Score — the single best retention predictor at this stage

Aim for 10/15 replies. Follow up once with stragglers, then let it go.

---

# Phase 2 — Expanded Beta (Days 8-21)

**Goal: 50-75 active testers. First real testimonials. Fix what Phase 1 surfaced.**

You now have 1-2 weeks of real-user data. Ship the fixes. Then expand.

## Where the next 50 come from

These channels are **specifically** for your target audience (beginners, women, returning riders). Avoid generic "cycling" subreddits where racers dominate and our positioning gets bounced.

### Reddit (highest yield)

- **r/bikecommuting** (~350k) — beginner/practical. *Best fit.*
- **r/bicycling** (~700k) — broader but has lots of beginners asking basic questions
- **r/xbiking** (~150k) — anti-pro-cycling culture, very on-brand for us
- ⚠️ Avoid **r/cycling** (pro-focused, will reject us)
- ⚠️ Avoid **r/Velo** (racers)

**Posting approach:** don't post "launching my app" — post **genuine value**, mention beta at the end.

Template R1 — Reddit (r/bikecommuting or r/xbiking):

```
Title: I got tired of cycling apps assuming you already know what FTP means — so I built one that doesn't

Body:

[2-3 paragraphs of your actual story — pulled from FOUNDER_STORY.md
Parts 1 and 5. Mention:

 - You're from a non-cycling background (Australia, didn't think of
   cycling as a sport)
 - Your girlfriend's getting into it and nothing existed for her
 - You built Etapa — AI cycling coach, plain English, no jargon
 - It's in private beta now

End with:]

If anyone here is a beginner, lapsed rider, or someone who's
been put off by cycling-app jargon — I'd love 10-15 of you
to test it. Comment "in" or DM me. Free forever for beta
testers.

If not for you, totally fine — would still love to hear
what put you off cycling apps in the past. Building the
thing I wish existed when I started.
```

**When to post:** Tuesday or Wednesday 9-11am PT (8am EST). Avoid weekends.

**Engagement rules:**
- Reply to every comment within the first 2 hours
- Don't crosspost to multiple subreddits same day — Reddit sees it as spam
- If you get pushback, engage calmly, don't defend

### Facebook groups (underrated for women audience)

Facebook groups are where women who've been put off by Reddit/Strava actually hang out. Search these:

- "Beginner cyclists UK"
- "Women who cycle UK"
- "Women's cycling community"
- Country-specific: "Cycling UK beginners", "Cycling Australia newcomers"
- Regional: "London cyclists", "Bristol cyclists" — local groups are gold

**Posting approach:** similar to Reddit but **warmer, shorter, more personal**. Facebook audience wants community, not pitches.

Template F1 — Facebook group post:

```
Hey all — sharing a project I'm working on. Full disclosure:
I built it, so feel free to ignore if that's not your thing.

I'm building Etapa, an AI cycling coach specifically for
beginners, returning riders, and women who've been put off
by the jargon-heavy apps out there. No FTP, no zone 2, no
"beast mode." Just plain-English plans that fit your life.

Opening 10 more beta spots this week. If any of the above
sounds like you, comment or DM and I'll send an invite today.

And genuinely — even if you don't want in, would love to
hear what you've wished existed in cycling apps.
```

**Etiquette:**
- **Ask the admin first** via DM — most groups require self-promo approval. Many will say yes for a thoughtful product.
- **Post once per group, ever.** Don't drip-feed.
- **If admins say no, don't go around them.**

### Instagram DMs (warm network)

Your personal Instagram + any cycling accounts you follow. DM 20 people who:

- Post beginner/commuter cycling content
- Follow @getetapa (once you have followers)
- Have engaged with your posts

Template I1 — Instagram DM:

```
Hey — I saw your post about [specific thing]. Loved it.

Quick ask: I'm building an AI cycling coach for beginners
and returning riders — no jargon, plain English, fits around
life. Opening beta testing this week.

Would you be up for testing it? Free forever if you are.
No worries if not — just thought you'd be a perfect match.
```

**Rule:** never send more than 1 DM per day to a cold account. Instagram flags bulk DM behaviour.

### Strava clubs

Join 3-5 local/relevant Strava clubs. Post in them (if they allow posts):

- Don't promote hard — share your ride, casually mention the app once
- Strava audience is mostly past-beginner but has a useful tail of new cyclists

### The register-interest list (cold half — no hopes filled in)

You've already written to the warm half in Phase 1. Now the cold half — people who gave just an email.

Template E1 — mail-merge OK here (lower personalisation expectation):

```
Subject: Beta-testing Etapa — 50 spots left

Hey,

You registered interest in Etapa a while back. Thanks for
being patient — we're now in private beta.

If you're on iOS and want to get early access, reply "beta"
and I'll send you an install link today.

Beta testers get free lifetime access when we launch.

Rob
```

## Goal for end of Phase 2 (day 21)

| Metric | Target |
|---|---|
| Active testers (used app ≥2x in last 14 days) | 50+ |
| Public testimonials / quotes you can use in launch | 8-10 |
| NPS from structured feedback | 7+ |
| Day-7 retention (of testers invited on day 8-14) | 50%+ |
| Biggest UX bugs found + fixed | 3-5 |
| Onboarding completion rate | 70%+ |

If any of these is red, **don't launch publicly in Phase 3.** Extend Phase 2 by a week, fix the issue, then launch with confidence.

---

# Phase 3 — Public Launch (Days 22-35)

**Goal: 1000+ installs in launch week. Beta testimonials as primary marketing.**

## The 4-day launch sprint

Public launches that try to "do everything on one day" underperform launches that spread over a week.

### Day 1 (Monday) — soft launch

- App Store goes live (submit for review 7+ days earlier, aim for Monday release)
- Email your beta tester list: "We're live — share if you feel like it"
- Post on @getetapa Instagram: "The app is live" + App Store link
- **Don't push hard yet** — let the App Store indexing settle for 24-48h

### Day 2 (Tuesday) — ProductHunt

- Launch on ProductHunt at 12:01am PT (the moment the ranking window opens)
- Pre-line: 10 beta testers + friends + relevant accounts ready to upvote in hour 1
- Founder comment explaining the story (pulled from `FOUNDER_STORY.md`)
- **Don't beg for upvotes** — but DO ask beta testers personally to comment their honest review
- Reply to every comment within the first 4 hours

### Day 3 (Wednesday) — Reddit + HN + Twitter

- **Reddit** — same 3 subs as Phase 2, different framing: "Launched the app today, thanks to everyone who gave feedback during beta"
- **Show HN** — title: *"Show HN: Etapa – AI cycling coach for beginners (not power-meter users)"* — post 8am PT
- **Twitter thread** — 8-tweet thread telling the launch story from your founder video. Tag @AnthropicAI, @ClaudeAI for the MCP angle
- **Instagram** — launch reel from your founder video (the "I didn't find it easy either" pull-out)

### Day 4 (Thursday) — press + newsletters

By Thursday you have:

- ProductHunt ranking (usually in the "Top 5 of the day" if done right)
- Beta testimonials published
- Organic social engagement

Use that social proof to email:

- **Ben's Bites** (AI newsletter, massive) — angle: "This indie dev shipped an MCP before their iOS app launched"
- **Latent Space** (AI podcast/newsletter) — same angle
- **Every** (newsletter about tech + life) — angle: "Building an AI coach for the non-data-nerds"
- **TechCrunch tips line** — usually dead but worth a shot
- **Local cycling magazines** — `Cycling Plus`, `Cyclist`, `Rouleur` — angle: "Someone finally built a beginner-first cycling app"

## The beta testimonial (your #1 launch asset)

Ask every Phase 1+2 tester, in week 2 of their beta:

```
If you've enjoyed Etapa so far — would you be up for writing
me a 2-3 sentence quote I can use when we launch? Something
like:

"Before Etapa, I had [X]. Now I [Y]. Best part is [Z]."

Totally optional. If you're in, I'll credit you by first
name + city.
```

Target: 10-15 testimonials by day 21. Use the best 5-8 on:

- Launch page (replace the MCP section on getetapa.com with testimonials during launch week)
- Every Instagram post in launch week
- ProductHunt description
- App Store "What's New" and description

**Real human quotes beat any marketing copy.** This is your unfair advantage over every incumbent.

## Launch week content cadence

Post **2x/day** on Instagram during launch week (not normal 1x/day):

| Day | Morning post | Evening post |
|---|---|---|
| Mon | "The app is live" announcement | Behind-the-scenes: "I didn't think we'd actually ship" |
| Tue | ProductHunt push | Tester testimonial #1 |
| Wed | Reddit/HN amplification | Tester testimonial #2 |
| Thu | Press coverage highlights | Tester testimonial #3 |
| Fri | "First week by the numbers" | Thank-you post |

Overwrite `THIS_WEEK.md` for launch week specifically with these 10 posts.

## Success metrics — day 7 post-launch

Honest benchmarks for a pre-existing brand with no-to-small following:

| Metric | Minimum | Good | Great |
|---|---|---|---|
| App Store installs (week 1) | 300 | 1,000 | 3,000 |
| ProductHunt rank | Top 10 | Top 5 | #1 |
| Day-7 retention | 35% | 45% | 55% |
| Free → paid conversion (if applicable) | 3% | 8% | 15% |
| Instagram followers gained | +200 | +500 | +1,500 |
| Press mentions | 1 | 3-5 | 10+ |

If you hit "Good" across the board, you've had a successful launch. "Great" is lottery-territory — don't plan for it.

---

# Content asset checklist

Everything you need ready before Phase 1 starts. Tick as you go.

## Phase 1 (private beta)

- [ ] TestFlight build live + installed on your own phone
- [ ] Personal-network DM list (10 names)
- [ ] Template T1 customised to your voice
- [ ] Email list of register-interest "with hopes" people
- [ ] Template T2 drafted
- [ ] Instagram post for T3 scheduled
- [ ] `beta@getetapa.com` or similar inbox set up
- [ ] Onboarding email template loaded
- [ ] Day-7 feedback email template loaded

## Phase 2 (expanded beta)

- [ ] Bug fixes from Phase 1 shipped in new TestFlight build
- [ ] Reddit post drafted (template R1)
- [ ] 3 target subreddits identified
- [ ] Facebook groups list (5-10 groups) + admins contacted
- [ ] Instagram DM list (20 accounts)
- [ ] Strava clubs joined (3-5)
- [ ] Email to cold register-interest list drafted
- [ ] Testimonial request email ready

## Phase 3 (public launch)

- [ ] App Store submission (submit 7 days before launch date)
- [ ] `getetapa.com` updated with testimonials + App Store badges
- [ ] ProductHunt page drafted + hunter organised (DM someone with 1000+ followers to hunt for you)
- [ ] Launch reel cut from founder video
- [ ] 10 launch-week Instagram posts queued in Buffer
- [ ] Reddit launch post drafted
- [ ] Show HN title + opening comment drafted
- [ ] Twitter launch thread drafted
- [ ] Press / newsletter email drafts ready

## Supporting systems

- [ ] Admin dashboard → Signups page actively monitored
- [ ] PostHog events firing for: install, plan-generated, first-ride-logged, coach-chat-used, trial-converted
- [ ] Slack webhook for every new signup (so you see them in real-time)
- [ ] Apple App Store review monitoring (reply to every review in <24h during launch week)

---

# What could go wrong

Known failure modes and what to do about each:

## "Nobody replies to my DMs"

Your message is too long or too salesy. Cut to 3 sentences. Lead with a personal observation about the person. Ask for a specific small commitment.

## "Testers install but never open again"

Onboarding friction. Likely culprits: the first plan takes >2 min to generate, the first session isn't clear enough, the app doesn't send a reminder the night before the first ride.

Fix the onboarding before you invite more testers.

## "My beta tester feedback is all positive but nobody converts"

Your testers are friends being polite. Rebalance Phase 2 toward strangers (Reddit + Facebook + cold list). Ruthless feedback only comes from people who don't know you.

## "ProductHunt launch flopped"

Usually because you didn't have a "hunter" (someone with an existing PH following to post for you), or you launched on a bad day (Sat/Sun/holiday).

If this happens — don't relaunch the same product. Pivot to Reddit + Show HN + press. ProductHunt is one channel, not the only one.

## "App Store review rejected us"

Common reasons: privacy policy link broken, "mentions of in-app purchases" without proper metadata, screenshots showing non-shipping features.

Fix + resubmit. Review takes 24-48h on resubmit. Plan for 1-2 rejection cycles — don't tell anyone the launch date until you're approved.

## "We're getting signups but nobody's paying"

Check the paywall copy + timing. "Too early" paywall (before value demonstrated) kills conversion. "Too late" paywall (after value delivered) = people leave anyway. Aim for paywall after first plan is generated and one ride is logged.

---

# Day-by-day execution for Week 1

Most concrete section. If you do one thing per day for the next 7 days, you hit Phase 1's goal.

## Monday — "Open the gate"

- Morning: ship a fresh TestFlight build. Install on your own iPhone. Smoke-test end-to-end.
- Afternoon: customise DM template T1 to your voice. Make a list of 10 people from your network.
- Evening: send 10 DMs. One at a time, personally. Don't mass-send.

**Day 1 target: 10 DMs sent, 3+ replies back.**

## Tuesday — "Warm list"

- Morning: pull the register-interest list from admin dashboard. Filter to people who filled in "hopes."
- Afternoon: customise T2 for each person, reference their actual hope quote. Max 15 emails.
- Evening: send the emails. Personally, manually, not mail-merge.

**Day 2 target: 15 warm emails sent, 5+ replies back.**

## Wednesday — "The first six"

- Morning: reply to all DMs + emails. Send TestFlight links to accepts.
- Afternoon: onboard each accepted tester with template. Watch the admin dashboard for their first install.
- Evening: 2-hour response SLA in full effect.

**Day 3 target: 6 testers accepted, 4+ installed.**

## Thursday — "Instagram opens the gate"

- Morning: post the Instagram T3 post
- Afternoon: reply to every comment, DM every "beta" commenter a TestFlight link
- Evening: onboard any new testers

**Day 4 target: 10 testers accepted total.**

## Friday — "Check-in day"

- Morning: check admin → Signups and your beta email
- Afternoon: DM any tester who hasn't opened the app yet ("how's it going?")
- Evening: write the first week-1-reflection blog post draft (to publish Monday)

**Day 5 target: 12 testers accepted, 9+ actively using.**

## Saturday — "Ride day"

- Personal ride — be a cyclist for a day, not a founder
- Take one photo of you cycling for Instagram (saved for next week's content)
- Think about what's working and what's not

**Day 6 target: nothing. Rest.**

## Sunday — "Plan week 2"

- Review all feedback so far. What's the top issue?
- Write a plan for shipping the fix by Wednesday
- Draft Reddit post R1 for Phase 2 (Tuesday posting)
- Update `THIS_WEEK.md` with week 2's content

**Day 7 target: 15 testers, Phase 2 ready to launch Tuesday.**

---

# Cross-references

| If you need to… | Read |
|---|---|
| The brand voice for the outreach messages | [`BRAND.md`](./BRAND.md) |
| The competitive claims to reference in Reddit posts | [`MARKET_RESEARCH.md`](./MARKET_RESEARCH.md) |
| The founder narrative for Reddit / HN / press | [`FOUNDER_STORY.md`](./FOUNDER_STORY.md) |
| The social content for launch week | [`STRATEGY.md`](./STRATEGY.md) Part 2 + [`THIS_WEEK.md`](./THIS_WEEK.md) |
| The MCP distribution templates (for press angle) | [`mcp-server/PLAN.md`](./mcp-server/PLAN.md) |

---

## Change log

- **2026-04-20** — First version. 3-phase plan (private beta → expanded beta → public launch) over 5 weeks. Includes paste-ready outreach templates (DM, email, Reddit, Facebook, Instagram), onboarding flow, feedback collection, success metrics, day-by-day Week 1 execution.
