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
  screen,
  reset,
  flush,
  events,
};

export default analytics;
