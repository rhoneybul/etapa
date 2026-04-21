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
    posthog = new PostHog(API_KEY, { host: HOST });
    console.log('[analytics] PostHog initialised.');
  } catch (err) {
    console.warn('[analytics] PostHog init failed:', err.message);
  }
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
};

export default analytics;
