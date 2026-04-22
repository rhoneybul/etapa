# Workflow control — what can I fix server-side?

> Companion to [REMOTE_FIRST_ARCHITECTURE.md](./REMOTE_FIRST_ARCHITECTURE.md) and [REMOTE_FIRST_CHECKLIST.md](./REMOTE_FIRST_CHECKLIST.md). Tells you, for a given production bug, whether you can ship a fix from the admin dashboard or whether you need to build.

The honest answer is "most user-facing bugs, yes; most logic bugs, no — for now". This doc shows you exactly which is which, and the roadmap to close the gap.

## The decision tree

```
Is the bug…
├─ A wrong or confusing piece of copy?                 → YES, remote fix
├─ A feature behaving badly for everyone?              → YES, flip the flag off
├─ A price / trial length / coupon that's wrong?       → YES, edit remote config
├─ A screen that's broken / loading forever?           → YES, kill-switch (NEW)
├─ Wrong screen when navigating from X?                → YES, redirect (NEW)
├─ A specific user saying "it doesn't work for me"?    → YES, per-user override
├─ A critical bug in an old app version?               → YES, bump min-version
├─ Wrong validation rule (e.g. min 2 days/week)?       → NO, build needed
├─ Wrong screen sequence in onboarding?                → NO, build needed (on roadmap)
├─ A step that should be skipped conditionally?        → NO, build needed (on roadmap)
├─ Wrong navigation logic (race condition / bug)?      → NO, build needed
└─ Business rule bug (e.g. trial calc wrong)?          → NO, build needed
```

## What's server-controllable TODAY

| Capability | How | Where to edit | Takes effect |
|---|---|---|---|
| **Copy / text** | `remoteConfig.t('copy.screen.key', 'fallback')` in the component | `/dashboard/config` → `copy` key | ≤ 5 min for all users |
| **Feature visibility** | `remoteConfig.getBool('features.X.enabled', true)` gate | `/dashboard/config` → `features` key | ≤ 5 min |
| **Pricing** | `pricing_config` remote row | `/dashboard/config` → pricing | Instant on next fetch |
| **Trial length** | `trial_config.days` | `/dashboard/config` → trial | Instant |
| **Coach list** | `coaches` remote JSON | `/dashboard/config` → coaches | Instant |
| **Kill a screen** | `workflows.screens.<Name>.disabled = true` | `/dashboard/config` → workflows → screens → `<Name>` | Instant (screens using `useScreenGuard`) |
| **Reroute a screen** | `workflows.screens.<Name>.redirectTo = 'Home'` | Same | Instant (screens using `useScreenGuard`) |
| **Maintenance mode** | `maintenance_mode.enabled = true` | `/dashboard/config` → maintenance | Instant, app-wide |
| **Force upgrade** | `min_app_version.ios / .android` | `/dashboard/config` → min_app_version | Instant for affected clients |
| **Banner on Home** | `banner.{active, message, cta}` | `/dashboard/config` → banner | Instant |
| **Per-user grant lifetime** | Admin → user page → Grant Lifetime | Users page | Immediate for that user |
| **Per-user unlock coach** | Admin → user page → Quick actions | Users page | Immediate |
| **Grant before signup** | `/dashboard/grants` | Grants page | When user signs up |
| **Rerun a failed plan-gen** | `/dashboard/plan-generations` → row → Rerun | Gen runs page | Immediate |
| **Regenerate a user's plan** | Admin → user → Plan row → Regenerate | Users page | 1–3 min |

## NEW in this release: screen kill-switch + redirect

The most leveraged gap was: **a screen is broken in production and we can't reach it through any existing lever**. Before today, you'd need an OTA or a build. Now:

### Disable a screen

```
/dashboard/config → workflows → screens → PlanLoadingScreen
  { "disabled": true, "disabledCopy": "Plan generation is paused — back in a few minutes." }
```

Every user on any version that has `useScreenGuard('PlanLoadingScreen', navigation)` in the component will see a friendly "Taking a break" panel with a Back button instead of the broken screen. Within 5 minutes of the admin edit.

### Redirect a screen

```
/dashboard/config → workflows → screens → BeginnerProgramScreen
  { "redirectTo": "Home" }
```

On mount, the screen auto-navigates to the target. Useful when a screen is buggy AND there's a sensible fallback destination.

### How to adopt on a new screen

Two lines at the top of the component:

```js
import useScreenGuard from '../hooks/useScreenGuard';

function MyScreen({ navigation }) {
  const guard = useScreenGuard('MyScreen', navigation);
  if (guard.blocked) return guard.render();
  // …normal render
}
```

That's it. The screen is now remotely neutralisable. Old clients (no `useScreenGuard`) ignore the config — it's purely additive.

### What you should NOT use it for

- **Hiding a feature permanently** — use a feature flag (`features.X.enabled`).
- **Time-based gating** — the workflow override is binary, not scheduled.
- **Different behaviour per user segment** — use `user_config_overrides` if one specific user is affected, else a proper build-time gate.

### Current coverage

| Screen | `useScreenGuard` wired? |
|---|---|
| PlanLoadingScreen | ✅ |
| Every other screen | ❌ (follow the two-line pattern to add) |

Rule of thumb: **every screen that has a non-trivial side effect** (a server call, a plan generation, a payment, a Strava sync) gets the guard wired. Static screens (About, Settings) are less critical.

## What's NOT server-controllable yet — the roadmap

### Tier A — next to close

**Flow steps as remote data.** Onboarding / PlanConfig / QuickPlan all have hard-coded step sequences. If step 3 is broken we can't skip it. Fix: migrate step lists to `workflows.flows.<name>.steps = [...]` with each step declaring its type + copy. Small, incremental screens adopt this one at a time.

**Validation rules.** "Minimum 2 days per week" is hardcoded in `PlanConfigScreen`. If we want to allow 1 day/week as an experiment, we ship a build. Fix: `workflows.validation.planConfig = { minDaysPerWeek: 2, minWeeks: 4 }` and read through a helper.

**Retry policies.** When plan-gen fails, the user sees an alert + dropped on home. What they probably want is an automatic retry with the last-known-good inputs. Fix: `workflows.retry.planGeneration = { maxAttempts: 2, showRetryButton: true }`.

### Tier B — harder, lower leverage

**Navigation logic.** "After SignIn, go to X unless Y" is bundled JS. Making this remote means a tiny rule engine evaluated client-side with safe primitives (user has plan? user is subscribed? feature X enabled?). Ship fodder for later.

**Error copy and actions per code.** Today all errors render a generic "Something went wrong". A map `errors.<code> = { message, action: 'retry' | 'back' | 'upgrade', cta: '…' }` would be a big UX upgrade and fits the remote-first pattern.

**Coach prompts.** The server already has them (for MCP), the app has its own copy. Dedupe to one remote source.

### Tier C — deliberately staying in the binary

- **React Navigation route structure** — the map of which screens CAN be navigated to. Safer bundled.
- **Animations, gestures, haptics** — design system internals.
- **Native modules** — RevenueCat, Strava OAuth, push notifications setup.
- **The `remoteConfig` + `useScreenGuard` services themselves** — the bootstrap layer.

## How to request a new remote lever

If you hit a production issue and catch yourself thinking "I wish I could change this from the admin dashboard", open an issue with:

1. **What the bug is** (one sentence)
2. **What config you wish existed** (e.g. `workflows.retry.planGeneration.maxAttempts`)
3. **What behaviour it should drive** (e.g. "if set, the plan loading screen retries N times before giving up")
4. **What the fallback when the config is absent should be** (always must answer this — new fields can never break old clients)

Follow the [REMOTE_FIRST_CHECKLIST.md](./REMOTE_FIRST_CHECKLIST.md) pattern when implementing. The list of "today's levers" above grows incrementally.

## Summary for your original question

> *"Does this mean we should be able to fix workflow bugs and issues on the server side? Can we get it to that point?"*

**Today:** ~80% of user-facing bugs can be mitigated without a build (copy, flags, per-user overrides, screen kill-switch, pricing, maintenance, force-upgrade). The remaining ~20% are logic bugs (navigation, validation, sequencing) that still need a build.

**Getting closer:** every new screen that wires `useScreenGuard` + uses `useRemoteText` for copy is one step further. The roadmap above describes the next three levers (flow steps, validation rules, retry policies) — shipping those gets us to ~95% server-controllable.

**What won't ever be remote:** the app's runtime shape itself (native modules, navigation config, bootstrap services). That's the right line to hold — if the bootstrap layer could be fully remote-controlled, a bug in the admin dashboard could brick every installed app.

---

*Related: [REMOTE_FIRST_ARCHITECTURE.md](./REMOTE_FIRST_ARCHITECTURE.md), [REMOTE_FIRST_CHECKLIST.md](./REMOTE_FIRST_CHECKLIST.md)*
