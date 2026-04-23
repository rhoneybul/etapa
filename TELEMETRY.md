# Telemetry & Tracking Strategy

How Etapa measures what users do, what it costs, and where the product breaks.

## Stack

- **PostHog** — product analytics, funnels, session replay. Free tier (1M events/month). Project API key in `EXPO_PUBLIC_POSTHOG_API_KEY`, host in `EXPO_PUBLIC_POSTHOG_HOST`.
- **Sentry** — crash + error tracking. DSN in `EXPO_PUBLIC_SENTRY_DSN`.
- **RevenueCat** — subscription lifecycle events, forwarded to PostHog via native integration.
- **Supabase** — durable log of every Claude API call for cost attribution (`claude_usage_log` table).

No Mixpanel, no Amplitude, no custom pipeline, no Datadog. Add only when a concrete limit is hit.

## Event naming

All events are `snake_case`, past-tense verbs, grouped by domain prefix:

- `app_opened`, `signed_in`, `signed_out`
- `goal_step_completed`, `goal_created`
- `config_step_completed`, `config_completed`
- `plan_generation_started`, `plan_generated`, `plan_generation_failed`, `plan_funnel_abandoned`
- `activity_viewed`, `activity_completed`, `activity_edited_ai` / `_manual`, `plan_edited_ai`
- `coach_chat_opened`, `chat_message_sent`, `chat_conversation_milestone`, `chat_closed`, `chat_exited_shortly_after_response`, `chat_plan_suggestion_received`, `chat_plan_update_applied`
- `paywall_viewed`, `paywall_tier_selected`, `paywall_subscribe_tapped`, `paywall_dismissed`, `purchase_completed`, `purchase_failed`, `purchase_cancelled`, `free_trial_started`, `purchases_restored`

From RevenueCat (server-side, via webhook → PostHog):

- `trial_started`, `trial_converted`, `trial_cancelled`
- `subscription_initial_purchase`, `subscription_renewed`, `subscription_cancelled`, `subscription_uncancelled`, `subscription_expired`, `subscription_paused`, `subscription_product_changed`
- `non_subscription_purchased`, `billing_issue`

All events are added via helpers in `src/services/analyticsService.js` — new events should be added there, not called ad-hoc with raw strings.

## User identity

- `analytics.identify(userId)` is called on every sign-in in `App.js`. The `userId` is the Supabase user id, which is also used as the RevenueCat App User ID — so client events, server webhook events, and subscription events all land on the same PostHog person profile.
- `analytics.reset()` is called on sign-out to prevent cross-user event bleed.
- Anonymous events before sign-in (`app_opened`, `paywall_viewed` on first launch) are attributed to a PostHog distinct_id that merges into the user profile on first `identify` call.

## The three funnels that matter

**1. Paywall conversion** — `paywall_viewed → paywall_tier_selected → paywall_subscribe_tapped → purchase_completed`. Break down by `source` property to segment by entry point (`onboarding`, `plan_ready`, `settings`, `trial_expired`, `home_upgrade_banner`, `home_subscribe_banner`, etc).

**2. Activation** — `app_opened → goal_created → plan_generated → activity_completed`. 7-day conversion window. The single most important product-health number.

**3. Coach engagement** — `coach_chat_opened → chat_message_sent → chat_conversation_milestone (turnCount=2) → (turnCount=4) → chat_plan_update_applied`. Tells you whether conversations go deep and whether users trust the coach.

Alongside those, a handful of trend insights: suggestion accept rate (`chat_plan_update_applied / chat_plan_suggestion_received`), short-exit rate (`chat_exited_shortly_after_response / chat_message_sent`), paywall dismissal breakdown by `tierAtExit`, and `plan_funnel_abandoned` broken down by `atScreen`.

## Session replay

Controlled entirely in code via `SCREEN_REPLAY_SAMPLE_RATES` in `analyticsService.js`:

- **Dashboard baseline: 5%** — PostHog auto-records 5% of all sessions.
- **Code-forced 100%** on conversion-critical screens: `Paywall`, `GoalSetup`, `PlanConfig`, `PlanLoading`, `PlanReady`, `BeginnerProgram`. Any session entering one of these is always recorded, overriding the baseline.
- All other screens fall back to the 5% baseline.
- Once a session is recording, it continues across screens until session end.

Text inputs are masked by default for GDPR compliance. Network telemetry and console logs are *not* captured — they carry auth tokens.

## Sentry

Attaches `user_id`, `app_version`, `platform`, `subscription_status` to every error as tags. Only P0 issues (crashes, payment failures, plan generation failures) route to email/Slack alerts. Everything else stays in the dashboard — no alert fatigue.

### Source maps

Minified stack traces are useless. The `@sentry/react-native/expo` plugin in `app.json` uploads source maps for both native builds (EAS Build) and OTA updates (EAS Update), tagged against a release string of `<version>+<buildNumber>` that matches what the app reports at runtime (`App.js` constructs the same identifier).

One-time setup (do this once; after that everything is automatic):

1. **Create a Sentry auth token** — [sentry.io → Settings → Account → API → Auth Tokens](https://sentry.io/settings/account/api/auth-tokens/). Scopes: `project:releases`, `project:write`, `org:read`.

2. **Set the token as an EAS secret** (used by `eas build` to upload native-bundle source maps):

   ```bash
   eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value sntrys_xxx
   ```

3. **Set the token as a GitHub secret** named `SENTRY_AUTH_TOKEN` (used by the `EAS Update (OTA)` step in `.github/workflows/app-publish.yml` to upload JS-bundle source maps for OTA releases).

If either secret is missing, the build/update still succeeds but Sentry stack traces stay minified. The workflow prints a warning for the OTA case; EAS Build fails silently on this one — check the build log for `Uploading source maps` if you want to verify.

To verify source maps are landing, trigger a test error in the app (`throw new Error('sentry source map test')`) and confirm the stack trace in Sentry shows original filenames (`src/screens/CoachChatScreen.js`) not `index.android.bundle`.

## Server-side Claude cost tracking

Every Claude API call the server makes is logged to `public.claude_usage_log` (Supabase) via `server/src/lib/claudeLogger.js`. One row per call, with:

- `user_id`, `feature`, `model`
- `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_create_tokens`
- `cost_usd` (computed from current Anthropic pricing)
- `duration_ms`, `status`, `request_id`, `metadata` (jsonb)

Features tracked: `plan_gen`, `plan_edit`, `activity_edit`, `coach_chat`, `content_guard`, `assess_plan`, `race_lookup`, `public_coach_ask`, `public_review_plan`, `public_sample_plan`.

Convenience view for quick queries: `claude_cost_per_user_30d`.

```sql
-- Who's costing the most?
select * from claude_cost_per_user_30d
 where total_cost_usd > 5
 order by total_cost_usd desc;

-- This week's spend by feature
select feature, sum(cost_usd) as usd, count(*) as calls
  from claude_usage_log
 where created_at > now() - interval '7 days'
 group by feature
 order by usd desc;
```

Writes are server-role only. RLS default-denies all client access.

## Daily per-user cost cap

`server/src/lib/claudeCostCap.js` enforces a rolling-24h spend limit per user. Default: **$2.00 USD**. Tune via env var `CLAUDE_DAILY_CAP_USD`.

Wired into the three highest-volume endpoints: `/coach-chat`, `/edit-plan`, `/edit-activity`. Plan generation is excluded (once per plan — can't spam).

Returns `429 { error, detail, cap_usd, spent_usd, feature }` on trip. Fails open on DB errors — transient Supabase issues never block a live user.

## Weekly review

Eight charts, same time every week, 30 minutes:

1. DAU trend
2. Activation rate (install → first session completed)
3. D7 retention curve
4. Paywall → purchase conversion rate
5. Paid churn
6. Crash-free session %
7. Weekly revenue (from RevenueCat → PostHog)
8. **North star:** WAU who completed ≥1 session in their 2nd week

Anything beyond those eight is noise until the business is larger.

## Event schema governance

When adding a new event:

1. Add a helper in `analyticsService.js` with a prose comment explaining *when it fires* and *what question it answers*.
2. Use past-tense snake_case.
3. Include properties that allow segmentation (`source`, `tier`, `coachId`, etc).
4. Don't wire it up in screens until the helper exists — no raw `track('…')` calls in screens.

When adding a server-side Claude call:

1. Use `logClaudeUsage({...})` after every fetch to `api.anthropic.com`.
2. Pick a feature name that matches an existing category if possible; invent a new one only if genuinely distinct.
3. Cap-gate the endpoint if it's user-triggered and repeatable (coach-chat-like).

## File map

- `src/services/analyticsService.js` — PostHog client, event helpers, session replay controls
- `App.js` — lifecycle events (`app_opened`, sign-in identify, sign-out reset), navigation replay trigger
- `src/screens/PaywallScreen.js` — paywall funnel events
- `src/screens/CoachChatScreen.js` — chat multi-turn + exit patterns
- `src/screens/GoalSetupScreen.js`, `PlanConfigScreen.js`, `PlanLoadingScreen.js` — `plan_funnel_abandoned` beforeRemove listeners
- `server/src/lib/claudeLogger.js` — usage logging helper + pricing
- `server/src/lib/claudeCostCap.js` — per-user rolling 24h cap
- `server/src/routes/ai.js` — all Claude endpoints wired for logging + capping
- `server/src/index.js` — public marketing endpoints wired for logging
- `supabase/migrations/20260422000001_create_claude_usage_log.sql` — table + view
