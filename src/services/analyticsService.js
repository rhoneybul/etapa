/**
 * Etapa Analytics — PostHog integration for React Native / Expo.
 *
 * Free tier: 1M events/month, no credit card required.
 * Sign up at https://posthog.com and grab your project API key + host.
 *
 * Env vars (add to .env):
 *   EXPO_PUBLIC_POSTHOG_API_KEY   — your PostHog project API key (starts with phc_)
 *   EXPO_PUBLIC_POSTHOG_HOST      — e.g. https://us.i.posthog.com
 *
 * Usage:
 *   import { analytics } from '../services/analyticsService';
 *   analytics.track('plan_generated', { weeks: 14, goalType: 'gran-fondo' });
 */

let posthog = null;
let isInitialised = false;

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
const HOST    = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

// ── Session replay config ─────────────────────────────────────────────────────
// PostHog dashboard handles the baseline sample rate (currently 5% —
// configured in Project Settings → Session Replay). This table FORCES
// recording on specific high-value screens, overriding that baseline.
//
//   rate = 1.0  → always start recording when this screen is entered
//                 (overrides the 5% dashboard sample so EVERY session on
//                 this screen is captured)
//   rate = 0.0  → do nothing — fall back to dashboard's 5% baseline
//   rate = 0.5  → 50% chance to force-start on this screen (stacks with
//                 the 5% dashboard baseline that still applies otherwise)
//
// Once a session is recording, it continues across screens — PostHog
// captures the entire session, not just the specific screen that triggered
// the recording. So these are really "screens that should guarantee the
// session is captured" rather than "only record this screen".
const SCREEN_REPLAY_SAMPLE_RATES = {
  // Money / conversion screens — 100% so we never miss a paywall drop-off
  Paywall:          1.0,
  // Onboarding funnel — 100% so we see exactly where new users get stuck
  GoalSetup:        1.0,
  PlanConfig:       1.0,
  PlanLoading:      1.0,
  PlanReady:        1.0,
  BeginnerProgram:  1.0,
  // Everything else: 0.0 = leave to the dashboard 5% baseline
  _default:         0.0,
};

function sampleRateForScreen(screenName) {
  if (screenName in SCREEN_REPLAY_SAMPLE_RATES) return SCREEN_REPLAY_SAMPLE_RATES[screenName];
  return SCREEN_REPLAY_SAMPLE_RATES._default;
}

// Tracks whether the current session has already started recording — avoids
// repeatedly calling startSessionRecording() on every screen transition.
let hasStartedRecordingThisSession = false;

// ── Initialisation ────────────────────────────────────────────────────────────
async function init() {
  if (isInitialised) return;
  isInitialised = true;

  if (!API_KEY) {
    console.log('[analytics] PostHog not configured — tracking disabled.');
    return;
  }

  try {
    const PostHog = require('posthog-react-native').PostHog;
    posthog = new PostHog(API_KEY, {
      host: HOST,
      // Session replay enabled at SDK level, but NOT started automatically.
      // We control start/stop programmatically via maybeStartRecordingForScreen()
      // so we can apply per-screen sampling rather than a flat global rate.
      enableSessionReplay: true,
      sessionReplayConfig: {
        // Mask anything that could leak PII or secrets. Essential for GDPR.
        maskAllTextInputs: true,
        maskAllImages: false, // images are mostly cycling screenshots, safe
        captureLog: false,    // don't capture console logs — noisy + PII risk
        captureNetworkTelemetry: false, // requests carry auth tokens — skip
        // Debounce so we don't record every single touch event — saves quota
        iOSdebouncerDelayMs: 500,
        androidDebouncerDelayMs: 500,
      },
    });
    console.log('[analytics] PostHog initialised (session replay = programmatic).');
  } catch (err) {
    console.warn('[analytics] PostHog init failed:', err.message);
  }
}

// ── Session replay controls ───────────────────────────────────────────────────

/**
 * Decide whether to start recording based on the current screen's sample rate.
 * Idempotent — once a session is already recording, this is a no-op (we don't
 * restart per screen; PostHog sessions are continuous across screens).
 *
 * Called from App.js's NavigationContainer.onStateChange after each navigation.
 */
function maybeStartRecordingForScreen(screenName) {
  if (!posthog) return;
  if (hasStartedRecordingThisSession) return;
  const rate = sampleRateForScreen(screenName);
  if (rate <= 0) return;
  if (Math.random() > rate) return;
  try {
    posthog.startSessionRecording();
    hasStartedRecordingThisSession = true;
    console.log(`[analytics] session replay started (screen=${screenName}, rate=${rate}).`);
  } catch (err) {
    console.warn('[analytics] startSessionRecording failed:', err.message);
  }
}

/** Force-start recording regardless of sample rate. Use for manual QA or support cases. */
function startRecording() {
  if (!posthog) return;
  try { posthog.startSessionRecording(); hasStartedRecordingThisSession = true; } catch {}
}

/** Stop recording the current session. */
function stopRecording() {
  if (!posthog) return;
  try { posthog.stopSessionRecording(); hasStartedRecordingThisSession = false; } catch {}
}

// ── Core methods ──────────────────────────────────────────────────────────────

function identify(userId, properties = {}) {
  if (!posthog) return;
  posthog.identify(userId, properties);
}

function track(event, properties = {}) {
  if (!posthog) return;
  posthog.capture(event, properties);
}

// Alias — matches PostHog's native API name. Many existing call sites use
// `analytics.capture(...)` expecting this to exist. Before this alias was
// added, those calls silently no-op'd because of `?.` chaining.
function capture(event, properties = {}) {
  return track(event, properties);
}

function screen(screenName, properties = {}) {
  if (!posthog) return;
  posthog.screen(screenName, properties);
}

function reset() {
  if (!posthog) return;
  posthog.reset();
}

function flush() {
  if (!posthog) return;
  posthog.flush();
}

// ── Pre-defined event helpers ─────────────────────────────────────────────────
// Grouped by funnel stage for clarity.

const events = {

  // ── App lifecycle ──────────────────────────────────────────────────────────
  appOpened: (props = {})                => track('app_opened', props),

  // ── Auth ───────────────────────────────────────────────────────────────────
  signedIn:    (method = 'google')      => track('signed_in', { method }),
  signedOut:   ()                        => track('signed_out'),

  // ── Goal creation funnel ───────────────────────────────────────────────────
  goalStepCompleted: (step, data = {})   => track('goal_step_completed', { step, ...data }),
  goalCreated: (props = {})              => track('goal_created', props),

  // ── Plan config funnel ─────────────────────────────────────────────────────
  configStepCompleted: (step, data = {}) => track('config_step_completed', { step, ...data }),
  configCompleted: (props = {})          => track('config_completed', props),

  // ── Plan generation ────────────────────────────────────────────────────────
  planGenerationStarted: (props = {})    => track('plan_generation_started', props),
  planGenerated: (props = {})            => track('plan_generated', props),
  planGenerationFailed: (error)          => track('plan_generation_failed', { error }),

  // Fired when the user exits a plan-creation screen without completing the
  // next step (e.g. hits back from GoalSetup or PlanConfig, or force-closes
  // PlanLoading). `atScreen` is the screen they abandoned at; `step` is the
  // sub-step inside that screen if any (GoalSetup has 3 steps).
  planFunnelAbandoned: (props = {})      => track('plan_funnel_abandoned', props),

  // ── Post-plan usage ────────────────────────────────────────────────────────
  planViewed: (props = {})               => track('plan_viewed', props),
  weekViewed: (weekNum, planId)          => track('week_viewed', { weekNum, planId }),
  weekNavigated: (direction, from, to)   => track('week_navigated', { direction, fromWeek: from, toWeek: to }),
  activityViewed: (props = {})           => track('activity_viewed', props),
  activityCompleted: (props = {})        => track('activity_completed', props),
  activityUncompleted: (props = {})      => track('activity_uncompleted', props),
  activityEditedManual: (props = {})     => track('activity_edited_manual', props),
  activityEditedAI: (props = {})         => track('activity_edited_ai', props),
  planEditedAI: (props = {})             => track('plan_edited_ai', props),
  planOverviewViewed: (planId, weeks)    => track('plan_overview_viewed', { planId, weeks }),
  calendarViewed: (month)               => track('calendar_viewed', { month }),
  planDeleted: (props = {})              => track('plan_deleted', props),

  // ── Coach interaction ──────────────────────────────────────────────────────
  coachSelected: (coachId)               => track('coach_selected', { coachId }),
  coachChatOpened: (coachId, scope)      => track('coach_chat_opened', { coachId, scope }),
  chatMessageSent: (props = {})          => track('chat_message_sent', props),
  chatPlanUpdateApplied: (coachId)       => track('chat_plan_update_applied', { coachId }),

  // Multi-turn engagement — fired when user message count crosses a milestone
  // (2, 4, 6, 10). Tells us whether conversations go deep or stay shallow.
  chatConversationMilestone: (props = {})=> track('chat_conversation_milestone', props),

  // Fired when user navigates away from the chat. Includes total turns + duration
  // so we can see whether users have long productive sessions or bail fast.
  chatClosed: (props = {})               => track('chat_closed', props),

  // Subset of chat_closed — fires when user exits within 10s of the coach's last
  // reply. Signal that the coach's answer didn't land well.
  chatExitedShortlyAfterResponse: (props = {}) => track('chat_exited_shortly_after_response', props),

  // Fired when Claude's reply contains a structured plan-change suggestion.
  // Pair with chat_plan_update_applied to compute suggestion accept rate.
  chatPlanSuggestionReceived: (props = {}) => track('chat_plan_suggestion_received', props),

  // ── Paywall ────────────────────────────────────────────────────────────────
  // Fired when the paywall screen mounts (someone saw the paywall).
  paywallViewed: (props = {})            => track('paywall_viewed', props),
  // Fired each time a user taps a tier to select it (before they subscribe).
  paywallTierSelected: (tier, from)      => track('paywall_tier_selected', { tier, from }),
  // Fired when the user dismisses the paywall without purchasing.
  paywallDismissed: (props = {})         => track('paywall_dismissed', props),
  // Fired after a successful subscription confirmed by RevenueCat.
  purchaseCompleted: (props = {})        => track('purchase_completed', props),
  // Fired when a purchase attempt fails (rejected card, network, etc.).
  purchaseFailed: (props = {})           => track('purchase_failed', props),
  // Fired when the user cancels the Apple/Google payment sheet.
  purchaseCancelled: (props = {})        => track('purchase_cancelled', props),

  // ── Plan picker (guided intake on the empty-state home) ──────────────────
  // Fired when the picker mounts — i.e. someone started the intake flow.
  planPickerStarted:     (props = {}) => track('plan_picker_started', props),
  // Fired for every answered question. `question` ∈ intent | longest_ride |
  // event_date | training_length. `choice` is the raw answer key (or ISO date).
  planPickerAnswered:    (props = {}) => track('plan_picker_answered', props),
  // Fired when the picker shows its recommendation. Properties: path.
  planPickerRecommended: (props = {}) => track('plan_picker_recommended', props),
  // Fired when the user picks a path from the recommendation screen. Includes
  // whether they overrode the recommendation (useful for measuring fit).
  planPickerChose:       (props = {}) => track('plan_picker_chose', props),
  // Fired when the user taps "Skip" and falls back to the legacy three-card
  // layout. `atStep` says where in the flow they bailed.
  planPickerSkipped:     (props = {}) => track('plan_picker_skipped', props),

  // ── Connections & settings ─────────────────────────────────────────────────
  stravaConnected:    ()                 => track('strava_connected'),
  stravaDisconnected: ()                 => track('strava_disconnected'),
  feedbackSubmitted: (category)          => track('feedback_submitted', { category }),

  // ── Screen views (automatic via App.js) ────────────────────────────────────
  screenViewed: (name)                   => screen(name),
};

// ── Public API ────────────────────────────────────────────────────────────────
export const analytics = {
  init,
  identify,
  track,
  capture,   // Alias for track — matches PostHog's native API name.
  screen,
  reset,
  flush,
  events,
  // Session replay controls — programmatic, overrides dashboard sample rate
  maybeStartRecordingForScreen,
  startRecording,
  stopRecording,
};

export default analytics;
