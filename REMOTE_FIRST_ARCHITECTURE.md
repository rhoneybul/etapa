# Remote-First Architecture

> How Etapa stays controllable from a phone. No laptop. No App Store review. No broken users.

The single most dangerous thing about shipping a mobile app is this: once a build is on a user's phone, it is frozen. If something is wrong — a typo, a broken coach prompt, a flag that should have been off, a subscription copy change, a feature you need to disable because someone is complaining on Twitter — you cannot fix it without shipping a new build through Apple's review pipeline. That is a 24–72 hour round trip, and it requires a laptop, a clean working tree, and time. None of those are always available.

The goal of this document is to describe how Etapa is architected so that the app is **always recoverable** and **always tunable from the backend**, with the smallest reasonable amount of logic baked into the native binary. Everything user-facing that could possibly change — copy, coach list, feature flags, pricing, error messages, onboarding steps, activity suggestions — should be fetchable at runtime, cacheable for offline, and overridable per user or per version.

This is not a new-feature document. It is an **operating doctrine** for how every new feature from here onwards should be built.

## The vision

Every time a user opens the app, a lightweight config payload is fetched from the backend. That payload tells the app:

- What copy to show (home screen titles, empty states, onboarding captions, error messages)
- Which features are enabled, globally and for this user
- What the current pricing is and what trial terms to offer
- Which coach personas are available and what their prompts look like
- Whether the app is in maintenance mode
- Whether the user must upgrade
- Any per-user overrides (grant a free month, enable a beta feature, unlock a coach)

The app keeps a local cache so it works offline. When the cache is missing the app falls back to sensible built-in defaults so it **never crashes because the server is unreachable**. When the backend returns new data, it replaces the cache and reactive UI picks it up on next render.

From a phone, via the admin dashboard, the founder can:

1. **Fix a typo** — edit `copy.home.emptyTitle`, push, live for every user within 5 minutes
2. **Respond to a support ticket** — grant a free month to a specific user, unlock a premium coach, reset their plan
3. **Disable a broken feature** — flip `features.stravaSync.enabled` to `false`, the app hides the button
4. **Update pricing** — change `pricing.monthly` from 799 to 699, app shows the new price immediately
5. **Push a banner** — set `banner.active` to a message and CTA, app shows a dismissible banner on Home
6. **Force an upgrade** — set `minVersion.ios` to the current production version, old builds see the upgrade gate

None of these require a build, a TestFlight push, or a git commit.

## Principles

**1. The backend is the source of truth for behaviour; the app is the source of truth for local data.**

Plans, goals, preferences, and activities live on the user's device (via AsyncStorage + Supabase sync). Config — how to render those things, what features are enabled, what to call them, what to do when something fails — comes from the backend.

**2. Every remote value has a hard-coded default in the binary.**

If the config endpoint is down, the app must still open and function. A `remoteConfig.get('coaches')` call always returns *something* useful — the cached copy if we have it, otherwise the bundled fallback.

**3. Schema changes are additive only.**

Never remove a key. Never change the shape of an existing key. If the client expects `coach.avatarInitials` as a string, every future version of the payload must still provide that field. New fields can be added freely because old clients will ignore them.

**4. The client declares its version; the server can adapt.**

Every request sends `X-App-Version: 0.95.12`. The server can return version-specific payloads — for example, a new pricing structure only for builds that know how to render it. Older clients get the legacy shape.

**5. Cache aggressively, invalidate deliberately.**

Config is fetched on app open and refreshed in the background. There is a short TTL (5 minutes) and a stale-while-revalidate strategy — the app always renders instantly from cache and updates in the background. A manual "force refresh" is available in settings for debugging.

**6. Feature flags are first-class, not afterthoughts.**

Every new feature ships behind a flag. The flag is on for internal users first, then rolled out. Flags are cheap — prefer a flag you might never use to a build you can't roll back.

**7. Copy is a config value, not a string in a component.**

Every customer-visible string is referenced by key (`copy.home.emptyTitle`, `errors.plan.generateFailed`), rendered through a helper (`t('copy.home.emptyTitle')`), and falls back to the hard-coded default if the key is missing.

**8. Per-user overrides exist and are easy to apply.**

Support says *"the app won't let me change my coach"*. The founder opens the admin dashboard, types the user's email, clicks "Unlock all coaches". Done. No code, no redeploy.

## Current state (what's already remote)

We're not starting from zero. The following already lives in `app_config`:

| Key | What it controls | Where it's used |
|---|---|---|
| `maintenance_mode` | Blocks app entry with a friendly screen | `App.js`, `MaintenanceScreen.js` |
| `min_app_version` | Forces users below a version to upgrade | `HomeScreen.js` |
| `trial_config` | Free trial length + banner message | `PaywallScreen.js` |
| `pricing_config` | Displayed prices for monthly/annual/lifetime/starter | `subscriptionService.js`, website |
| `coupon_config` | Starter/lifetime coupon codes | `PaywallScreen.js` |
| `coming_soon` | What's-coming-next card on home | `HomeScreen.js`, `SettingsScreen.js` |
| `strava_enabled` | Hides Strava integration | `SettingsScreen.js` |

The admin dashboard at `/dashboard/config` can edit all of these. There's an `PUT /api/admin/app-config/:key` endpoint behind auth. This is the foundation; we just need to push more into it.

## What should become remote

Ranked by leverage (highest first):

### Tier 1 — must be remote

**Copy blocks.** Every string in the UI that isn't a label on a primary action. Home screen intro, empty states, error messages, onboarding captions, explainer paragraphs, pricing page copy. Rule of thumb: if the marketing team might want to change it without a build, it's remote.

**Error messages.** `errors.plan.generateFailed`, `errors.strava.syncFailed`, `errors.auth.expired`. When something goes wrong we want to tell the user a clear, up-to-date message — not "Something went wrong" frozen in v0.95.11.

**Feature flags.** Any non-trivial feature behind `features.<name>.enabled`. Strava sync, AI coach chat, Quick Plan pathway, beginner program, push notifications. A flipped flag hides the UI without breaking navigation.

**Coach list.** Coach personas (`COACHES` array), including name, bio, persona prompt, tagline, level. We want to add, remove, reorder, or retune coaches without a build. The server already has the personas for MCP — dedupe them.

**Fitness levels and plan durations.** Currently hardcoded in `QuickPlanScreen.js` and `PlanConfigScreen.js`. Making these remote means we can experiment with adding a "Returning rider" level, or offering 16-week plans, without shipping.

### Tier 2 — high value

**Activity suggestions and labels.** `src/utils/sessionLabels.js` has mappings from session types to icons, colours, and labels. Moving these to remote means we can add new session types (`mobility`, `zone-2-outdoor`, `skills`) on demand.

**Beginner program structure.** The 12-week beginner programme is currently data-driven but bundled. Making the week-by-week structure remote means we can iterate on the programme without losing existing users who are mid-way through.

**Onboarding content.** Screen titles, captions, coach recommendations, illustrations. Onboarding is where we lose the most users — being able to A/B test copy from the admin panel is game-changing.

**Paywall copy and layout.** Which plans to show, in what order, with what benefits, with what "recommended" badge. This drives revenue directly.

### Tier 3 — nice to have

**Navigation flags.** Which tabs are visible, which screens are reachable. Lets us hide a screen that's broken in production without shipping.

**Icon and colour tokens.** The design system itself (primary colour, accent, border radii). Unlikely to change often but making them remote means rebranding is a config push.

**Analytics event definitions.** Which events to send, which properties to include. Useful if we discover we're missing a property in production.

## Architecture diagram

```
┌────────────────────────────────────────────────────────────────┐
│                         iOS / Android app                       │
│                                                                 │
│  ┌──────────────────┐      ┌──────────────────┐                │
│  │   Screens &      │◀────▶│  remoteConfig    │                │
│  │   Components     │      │  service         │                │
│  │                  │      │  (with cache)    │                │
│  └──────────────────┘      └──────────────────┘                │
│        uses get('...')           │     │                        │
│                                  │     │ AsyncStorage cache     │
│                                  │     ▼                        │
│                                  │  ┌──────────────┐            │
│                                  │  │ last-known-  │            │
│                                  │  │ good config  │            │
│                                  │  └──────────────┘            │
│                                  │                              │
│                                  ▼ fetch (with X-App-Version)  │
└──────────────────────────────────┼──────────────────────────────┘
                                   │
                                   ▼
                    ┌───────────────────────────┐
                    │   Express /api/app-config │
                    │                           │
                    │  - merges defaults        │
                    │  - applies per-user       │
                    │    overrides              │
                    │  - version-adapts         │
                    │  - Cache-Control headers  │
                    └───────────────────────────┘
                                   │
                                   ▼
                    ┌───────────────────────────┐
                    │  Supabase                 │
                    │  - app_config             │
                    │  - user_overrides         │
                    │  - feature_flags          │
                    └───────────────────────────┘
                                   ▲
                                   │ PUT /api/admin/app-config/:key
                                   │ POST /api/admin/user-overrides
                    ┌───────────────────────────┐
                    │  Admin dashboard          │
                    │  (mobile-friendly)        │
                    └───────────────────────────┘
```

## The contract

The app fetches config at open and on resume-from-background (throttled to every 5 minutes). The response is a single JSON document with top-level sections:

```json
{
  "version": 3,
  "features": {
    "stravaSync":    { "enabled": true },
    "aiCoachChat":   { "enabled": true },
    "quickPlan":     { "enabled": true },
    "beginnerProgram": { "enabled": true }
  },
  "copy": {
    "home.emptyTitle":   "Ready when you are",
    "home.emptySubtitle": "Pick a pathway — we'll handle the rest.",
    "home.pathway.beginner.title": "Getting into cycling",
    "home.pathway.plan.title":     "Build a proper plan",
    "home.pathway.quick.title":    "Just want to improve",
    "errors.plan.generateFailed":  "We couldn't build your plan. Try again in a moment."
  },
  "coaches": [
    { "id": "clara", "name": "Clara", "surname": "Moreno", "tagline": "Warm and encouraging", "level": "beginner", "avatarInitials": "CM", "avatarColor": "#2563A0" }
  ],
  "fitnessLevels": [
    { "key": "beginner",     "label": "Beginner",     "description": "New to cycling or riding less than twice a week" }
  ],
  "planDurations": [
    { "weeks": 4, "label": "4 weeks" },
    { "weeks": 8, "label": "8 weeks" }
  ],
  "maintenance":   { "enabled": false, "title": "", "message": "" },
  "minVersion":    { "ios": "0.95.0", "android": "0.95.0", "message": "..." },
  "pricing":       { "currency": "gbp", "monthly": 799, "annual": 4999, "lifetime": 9999, "starter": 1499 },
  "trial":         { "days": 7, "bannerMessage": "Subscribe to unlock full training access" },
  "banner":        { "active": false, "message": "", "cta": null },
  "userOverrides": {
    "features": { "aiCoachChat": { "enabled": true } },
    "coachesUnlocked": ["elena", "lars"]
  }
}
```

**Rules on this shape:**

- `version` is an integer. We bump it whenever we add a new top-level section. The client uses it only for debugging and telemetry.
- Every section is optional — if missing, the client uses its built-in defaults.
- Every field inside a section is optional — if missing, the client uses that field's built-in default.
- Nothing is ever removed. We only add.
- `userOverrides` is merged deep-last so it wins over everything else.

## The client side: `remoteConfig` service

A single module — `src/services/remoteConfig.js` — is responsible for all of this:

- Fetches config on app open
- Persists to AsyncStorage after every successful fetch
- Returns cached config instantly if available, stale-while-revalidate style
- Fires an event when the config changes so reactive screens can re-render
- Exposes typed accessors: `remoteConfig.getString(key, fallback)`, `remoteConfig.getBool(key, fallback)`, `remoteConfig.getJson(key, fallback)`
- Merges user overrides on top of global values
- Sends `X-App-Version` on every request

Every component that needs a remote value imports the service and calls it, with a **mandatory fallback**:

```js
import remoteConfig from '../services/remoteConfig';
import { COACHES as LOCAL_COACHES } from '../data/coaches';

const coaches = remoteConfig.getJson('coaches', LOCAL_COACHES);
```

The fallback is the bundled-in default. This is what makes the app safe — if the backend is unreachable, if the payload is malformed, if we introduced a bug on the server, the app still runs.

## The server side: `/api/app-config`

The existing endpoint returns a flat key-value dump of the `app_config` table. We extend it to:

1. Accept `?appVersion=x.y.z` (or read `X-App-Version`) and return version-adapted payloads.
2. Look up `user_overrides` for the authenticated user and merge them into the response under `userOverrides`.
3. Apply a short `Cache-Control: public, max-age=60, stale-while-revalidate=600` so CDN or proxy caching works.
4. Return all Tier 1 remote sections in a single shot — `features`, `copy`, `coaches`, `fitnessLevels`, `planDurations` — each read from its own `app_config` key.

**Why one endpoint, not many.** A single request on app open is cheaper, faster, and easier to cache than five parallel requests. It also means the client gets a consistent snapshot — no risk of reading half-updated data.

## Per-user overrides (the support-ticket lever)

When a user writes in saying *"I paid but the app still says I need to subscribe"*, we need to do one thing and one thing only from the admin dashboard: **grant that user the feature they're missing**, for as long as they need it.

A new table — `user_config_overrides` — stores per-user overrides as JSONB:

```sql
create table public.user_config_overrides (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  overrides    jsonb not null default '{}',
  note         text,
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now()
);
```

The admin dashboard has a per-user "Quick actions" panel:

- Grant free month → writes `{ "trial": { "days": 30 }, "entitlement": "pro" }` to this user's overrides
- Unlock premium coaches → writes `{ "coachesUnlocked": ["elena", "lars", "tom"] }`
- Reset plan → deletes their plan rows + clears `overrides.lastPlanBlock`
- Force re-onboarding → writes `{ "forceOnboarding": true }`
- Grant lifetime access → writes `{ "entitlement": "lifetime" }`

All of this happens with two taps on a phone. No code, no deploy, no build.

## Phased migration plan

We don't rebuild everything in one go. We do this in phases, each independently shippable.

### Phase 0 — foundation (this week)

- [x] `app_config` table exists, admin dashboard can edit it
- [ ] Write `src/services/remoteConfig.js` with cache, TTL, fallbacks
- [ ] Extend `GET /api/app-config` to return structured sections + merge overrides
- [ ] Add `user_config_overrides` table + `/api/admin/user-overrides` endpoints
- [ ] Ship it — no UI changes yet, just infrastructure

### Phase 1 — copy + errors (next week)

- [ ] Create `copy.*` seed in `app_config` with every string currently in Home, Onboarding, Paywall
- [ ] Replace strings in those screens with `t('copy.xxx', 'fallback')`
- [ ] Create `errors.*` map and a single `reportError(key, context)` helper that uses the remote copy
- [ ] Add copy editor to the admin dashboard

### Phase 2 — feature flags (next week)

- [ ] Create `features.*` seed with every major feature
- [ ] Gate every relevant UI element with `if (remoteConfig.getBool('features.xxx.enabled', true)) { ... }`
- [ ] Add feature flag panel to admin dashboard — toggle any flag with one tap

### Phase 3 — coaches + plan config (week after)

- [ ] Move `COACHES` into `app_config.coaches`
- [ ] Move fitness levels and durations into `app_config.fitnessLevels` / `.planDurations`
- [ ] Dedupe server-side coach prompts so MCP and the app share a single source
- [ ] Admin can edit personas, see a "try this prompt" sandbox

### Phase 4 — per-user overrides (week after)

- [ ] `user_config_overrides` table + RLS policies
- [ ] Admin "Quick actions" page for support scenarios
- [ ] User lookup by email, one-tap grant flows
- [ ] Audit log of every override applied

### Phase 5 — banners and announcements (rolling)

- [ ] `banner.active` config value + bundled `<Banner />` component
- [ ] Dismissible, with CTA link, shown on Home
- [ ] Scheduled announcements via the admin panel

## What stays in the app

Not everything belongs on the backend. These things stay bundled:

- Layout logic and navigation structure (React Navigation config)
- Core gestures, animations, haptics
- Native module integrations (RevenueCat, Strava OAuth, push notification setup)
- Crash reporting setup (Sentry)
- The `remoteConfig` service itself (obviously)
- Anything required before the app has network access

If it's about *shape* and *behaviour*, it's bundled. If it's about *content* or *state*, it's remote.

## Admin dashboard: mobile-first

The admin panel is currently desktop-oriented. To keep this actually usable from a phone we add a **`/dashboard/quick`** page optimised for mobile:

- Big touch targets, no tables, no hover states
- Scrollable list of the 10 most common actions
- User search by email at the top
- Per-user quick actions in a bottom sheet
- "Copy fix" section — top 20 copy values with inline editing
- "Feature flags" — list of toggles
- Banner composer

This is the page the founder opens at 10pm when someone's tweeting about a bug.

## Failure modes and mitigations

**Backend down.** App uses AsyncStorage cache from last successful fetch. All defaults are bundled. Nothing breaks.

**Malformed payload.** `remoteConfig` validates types — `getString` that gets a non-string returns the fallback. `getJson` catches parse errors. Sentry captures the error for us to fix.

**Schema migration bug.** New client expects a field old server doesn't return. The `getJson(key, fallback)` pattern means we silently fall back. The client never crashes for missing keys.

**User override accidentally applied to everyone.** `user_config_overrides` has a `user_id` primary key — there is no "everyone" row by design. If we need a global change we edit `app_config`, which has different access patterns.

**Typo in copy payload.** Worst case, users see a weird string for a few minutes. Admin fixes it. Done.

**Cache poisoned.** Settings screen has a "Force refresh config" button that wipes the cache and re-fetches. Also available via a deep link we can send a user: `etapa://debug/refresh-config`.

## Summary

The app should be boring infrastructure that renders what the server tells it to. Business logic, copy, pricing, personas, feature availability — all of it lives on the backend and can be changed with a tap. When the server is unreachable, the app uses a cached copy or bundled defaults. When something breaks in production, the founder opens an admin page on their phone, flips a flag or fixes a string, and the fix propagates within minutes.

**No laptop. No App Store review. No broken users.**

---

*Related docs: [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md), [CLAUDE.md](./CLAUDE.md)*
