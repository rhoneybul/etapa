/**
 * strings.js — centralised, remote-overridable UI copy.
 *
 * Every customer-facing string in the app lives here with a stable key and a
 * hard-coded default. Components call `t('key')` and get either the remote
 * value (if one has been pushed from the admin panel) or the default.
 *
 * Two reasons to care:
 *
 *   1. The founder can fix any typo / rewrite any line from the admin panel
 *      without shipping a new build. See REMOTE_FIRST_ARCHITECTURE.md.
 *
 *   2. We have one searchable, grep-able file that lists the tone of the app.
 *      If you want to change the voice across the whole app, start here.
 *
 * How to use:
 *
 *   import { t, tString } from '../services/strings';
 *
 *   <Text>{t('home.emptyTitle')}</Text>            // remote-first lookup
 *   <Text>{t('home.pathway.quick.title')}</Text>
 *
 * How to add a new string:
 *
 *   1. Add a key + default below
 *   2. Use `t('your.key')` in the component
 *   3. Optionally push a remote override via admin dashboard
 *
 * Rules:
 *   - Never remove a key — old clients still read it
 *   - Never change the shape of a key (always a string)
 *   - Keys use dot.notation, lowercase, no spaces
 */

import remoteConfig from './remoteConfig';

// ── Defaults (the "safe" copy bundled in the binary) ────────────────────────
// Organised by screen / surface so they're easy to scan.
export const DEFAULT_STRINGS = {
  // Home — empty state + three pathways
  'home.emptyTitle':            'Ready when you are',
  'home.emptySubtitle':         "Pick a pathway — we'll handle the rest.",
  'home.pathway.beginner.title':       'Getting into cycling',
  'home.pathway.beginner.description': 'Brand new, or coming back after a long break. A structured, gentle programme — no jargon, no experience needed.',
  'home.pathway.beginner.badge':       'BEGINNER FRIENDLY',
  'home.pathway.plan.title':           'Building a plan',
  'home.pathway.plan.description':     "A sportive, a first 100 km, a race. Tell us the goal, we'll build the plan around your schedule and life.",
  'home.pathway.plan.badge':           'AI-POWERED',
  'home.pathway.quick.title':          'Just want to improve',
  'home.pathway.quick.description':    'No event, no target distance — just a flexible plan to get fitter on the bike. Tell us your level and how long; we do the rest.',
  'home.pathway.quick.badge':          '2-MINUTE SETUP',
  'home.chooseSub':                    "Choose how you'd like to get started",

  // Quick Plan screen
  'quickPlan.headerTitle':      'Just want to improve',
  'quickPlan.intro':            "Three questions. We'll build the rest.",
  'quickPlan.q1':               'How fit are you right now?',
  'quickPlan.q2':               'How long a plan do you want?',
  'quickPlan.q3':               'How many days a week can you ride?',
  'quickPlan.hint':             "You can change any of this later. We'll pick coaching style and session types for you — just dive in and see how it feels.",
  'quickPlan.cta':              'Build my plan',

  // Errors — single source of truth for friendly messages
  'errors.generic':             "Something didn't work. Give it another go in a moment.",
  'errors.network':             "We couldn't reach the server. Check your connection and try again.",
  'errors.auth.expired':        'Your session expired. Sign in again to continue.',
  'errors.plan.generateFailed': "We couldn't build your plan right now. Try again in a moment — we've logged the issue.",
  'errors.plan.updateFailed':   "We couldn't save that change. Try again in a moment.",
  'errors.strava.syncFailed':   "Strava sync hit a snag. It'll retry on its own in a few minutes.",
  'errors.purchase.failed':     "Your purchase didn't go through. No charge was made — try again or contact us.",
  'errors.purchase.restore':    'Restore failed. Double-check you are signed in with the same Apple ID.',

  // Maintenance / upgrade gates (defaults in case remote config is unreachable)
  'maintenance.defaultTitle':   "We'll be right back",
  'maintenance.defaultMessage': 'Sorry, our wheels are spinning — we will be back soon.',
  'upgrade.defaultTitle':       'Update available',
  'upgrade.defaultMessage':     'A new version of Etapa is available with important updates. Please update to continue.',
  'upgrade.cta':                'Update now',

  // Paywall
  'paywall.subtitle':           'Keep the plan going, keep the coach talking.',
  'paywall.trialBadge':         '7-day free trial',
  'paywall.benefit.1':          'Personalised AI coaching plan',
  'paywall.benefit.2':          'Chat with your coach any time',
  'paywall.benefit.3':          'Strava sync + weekly adjustments',
  'paywall.benefit.4':          'Cancel any time from settings',

  // Onboarding
  'onboarding.welcome.title':   'Welcome to Etapa',
  'onboarding.welcome.body':    "We'll build your cycling plan in plain English. No jargon, no intimidation.",
  'onboarding.goal.title':      'What kind of rider are you?',
  'onboarding.coach.title':     'Pick a coach you like the sound of',
  'onboarding.coach.body':      "You can swap them any time. They're all qualified — just different personalities.",
};

/**
 * t(key) — returns the remote-override value if present, otherwise the default.
 * If no default exists for the key, returns the key itself (so missing copy is
 * visible in dev rather than silently empty).
 */
export function t(key) {
  const fallback = DEFAULT_STRINGS[key];
  const resolvedFallback = fallback === undefined ? `[${key}]` : fallback;
  return remoteConfig.getString(`copy.${key}`, resolvedFallback);
}

/**
 * tString(key, fallback) — for one-offs that don't belong in DEFAULT_STRINGS
 * (e.g. dynamic banner text that's entirely admin-driven).
 */
export function tString(key, fallback = '') {
  return remoteConfig.getString(`copy.${key}`, fallback);
}

export default t;
