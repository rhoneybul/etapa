/**
 * Ride-tips generation helpers.
 *
 * The product surface: on the activity detail screen, riders can tap
 * "Show ride tips" and see a small set of actionable bullets — warm-up,
 * hydration, fuelling, pacing, cool-down, recovery, injury watch-outs.
 *
 * v1 was a deterministic JS template (`generateRideTips` in
 * ActivityDetailScreen.js). It worked, but every rider got the same six
 * bullets for the same session shape, with no awareness of the
 * session's *structure* (e.g. 4×4-min VO2 vs 6×3-min threshold both
 * fell into the "intervals" branch and got identical advice), the
 * rider's actual goal, or sub-type nuance.
 *
 * v2 (this file) feeds the same shape — `{ category, icon, title, text }[]`
 * — but generates each set via Claude Haiku 4.5 on first view, caches it
 * to `activities.tips`, and uses it on every subsequent open. Haiku is
 * 5× cheaper than Sonnet and the task is well within its capability.
 *
 * Two safety rails:
 *   1. ICON_ALLOWLIST — the model can only return icons we've already
 *      vetted as existing in MaterialCommunityIcons. Anything else gets
 *      a sane category default before it reaches the client (which
 *      otherwise renders a question-mark glyph).
 *   2. sanitiseTips — same medical-drift regex set as the weekly
 *      check-in path. Any tip whose `text` strays into "rest for two
 *      weeks", "apply ice", "you have tendinitis" territory is replaced
 *      with the physio-referral copy.
 *
 * The deterministic generator below is kept as the fallback when Claude
 * is down or returns garbage — same shape, same icon vocabulary, just
 * less personalised. The client also keeps a copy as the "show
 * something while we wait for the network" placeholder.
 */

const { MEDICAL_DRIFT_PATTERNS, PHYSIO_REFERRAL } = require('./checkinSafety');

// ── Icon allowlist (mirrors client) ─────────────────────────────────────────
// Every glyph here has been verified to exist in MaterialCommunityIcons —
// adding a new one should be paired with a quick sanity check on the
// client (see ActivityDetailScreen tip render). The category-default map
// below is the safety net if the model returns something off-list.
const ICON_ALLOWLIST = new Set([
  'arm-flex-outline',
  'cup-water',
  'food-apple-outline',
  'speedometer',
  'speedometer-slow',
  'snowflake',
  'silverware-fork-knife',
  'shield-check-outline',
  'heart-pulse',
]);

const CATEGORY_DEFAULT_ICON = {
  warmup: 'arm-flex-outline',
  hydration: 'cup-water',
  fuel: 'food-apple-outline',
  pacing: 'speedometer',
  cooldown: 'snowflake',
  recovery: 'silverware-fork-knife',
  injury: 'shield-check-outline',
};

const ALLOWED_CATEGORIES = new Set(Object.keys(CATEGORY_DEFAULT_ICON));

// ── Output sanitiser ────────────────────────────────────────────────────────
// Walk every tip and:
//   - normalise category to lowercase, drop tips whose category is
//     unknown (the client has no render path for arbitrary categories).
//   - swap unknown icons for the category default rather than dropping
//     the tip — losing fuelling because the model picked a non-existent
//     "burger" icon would be a worse outcome than swapping the glyph.
//   - replace any text that hits a medical-drift pattern with the
//     physio-referral string. Belt-and-braces on top of the system
//     prompt's "no medical advice" directive.
//
// Returns a NEW array — never mutates input. Adds `_sanitised` flag at
// array level when at least one substitution was made (caller can log).
function sanitiseTips(tips) {
  if (!Array.isArray(tips)) return [];
  let sanitised = false;
  const out = [];

  for (const raw of tips) {
    if (!raw || typeof raw !== 'object') continue;
    const category = String(raw.category || '').toLowerCase().trim();
    if (!ALLOWED_CATEGORIES.has(category)) {
      sanitised = true;
      continue;
    }

    let icon = String(raw.icon || '').trim();
    if (!ICON_ALLOWLIST.has(icon)) {
      icon = CATEGORY_DEFAULT_ICON[category];
      sanitised = true;
    }

    const title = typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim().slice(0, 60)
      : defaultTitleFor(category);

    let text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (!text) continue; // empty tip is useless

    for (const re of MEDICAL_DRIFT_PATTERNS) {
      if (re.test(text)) {
        text = PHYSIO_REFERRAL;
        sanitised = true;
        break;
      }
    }

    // Soft length cap — we render these in a card, not a wiki page.
    if (text.length > 600) text = text.slice(0, 600).replace(/\s+\S*$/, '') + '…';

    out.push({ category, icon, title, text });
  }

  if (sanitised) Object.defineProperty(out, '_sanitised', { value: true, enumerable: false });
  return out;
}

function defaultTitleFor(category) {
  switch (category) {
    case 'warmup': return 'Warm-up';
    case 'hydration': return 'Hydration';
    case 'fuel': return 'Fuelling';
    case 'pacing': return 'Pacing';
    case 'cooldown': return 'Cool down';
    case 'recovery': return 'Recovery';
    case 'injury': return 'Watch for';
    default: return 'Tip';
  }
}

// ── Deterministic fallback ─────────────────────────────────────────────────
// Slim mirror of the client's generateRideTips. Used when Claude fails
// or returns nothing parseable — every rider should still see a
// reasonable card. Intentionally shorter than the client copy to keep
// the lib small; if Claude is up, the client will get the full AI
// version anyway.
function buildDeterministicTips(activity = {}) {
  const dur = Number(activity.durationMins) || 60;
  const effort = String(activity.effort || 'moderate').toLowerCase();
  const subType = String(activity.subType || 'endurance').toLowerCase();
  const isHard = effort === 'hard' || effort === 'max' || subType === 'intervals' || subType === 'tempo';
  const isLong = dur >= 120;
  const isRecovery = subType === 'recovery' || effort === 'recovery';

  const tips = [];

  tips.push({
    category: 'warmup', icon: 'arm-flex-outline', title: 'Warm-up',
    text: isHard
      ? 'At least 10 min easy spinning, then 2–3 short openers (30 s gradual ramps to about 90 % of the target effort, with full recovery between). Cold legs at threshold blow up the first interval.'
      : isRecovery
        ? 'Start the ride at the effort you’ll hold all the way through. The whole session is the warm-up.'
        : 'First 5–10 min in an easy gear, sitting in the saddle, cadence around 90 rpm. Open the legs gradually rather than launching into the working effort.',
  });

  tips.push({
    category: 'hydration', icon: 'cup-water', title: 'Hydration',
    text: dur <= 45
      ? 'A single bottle of water is plenty. Sip on a regular cadence rather than waiting until you feel thirsty.'
      : dur <= 90
        ? 'One full bottle (500–750 ml). A few sips every 15 min. Add an electrolyte tab if it’s warm.'
        : `For a ${dur}-minute ride, bring two bottles or plan a refill stop. Aim for 500–750 ml per hour. Electrolytes from the start — don’t wait until you’re cramping.`,
  });

  tips.push({
    category: 'fuel', icon: 'food-apple-outline', title: 'Fuelling',
    text: dur <= 60
      ? 'You shouldn’t need to eat during the ride. A light meal 1–2 hours beforehand sets you up cleanly.'
      : dur <= 120
        ? 'Pack a banana or an energy bar. Start eating around the 45-minute mark — 30–60 g of carbs per hour keeps the legs honest.'
        : 'Long ride. Aim for 60–90 g carbs per hour — mix gels, bars, and real food. Start eating in the first 30 minutes.',
  });

  tips.push({
    category: 'pacing',
    icon: isRecovery ? 'speedometer-slow' : 'speedometer',
    title: 'Pacing',
    text: subType === 'intervals' || effort === 'max'
      ? 'Pace each interval to be sustainable for the full duration. If rep 1 leaves you gasping, ease off — make every rep look the same.'
      : subType === 'tempo' || effort === 'hard'
        ? 'Tempo / threshold should feel "comfortably uncomfortable" — sustainable, but you’d struggle to hold a full conversation.'
        : isRecovery
          ? 'Genuinely easy. If you’re overtaking other riders, you’re going too hard.'
          : 'Keep it conversational — full sentences. This is where the aerobic engine actually grows.',
  });

  tips.push({
    category: 'cooldown', icon: 'snowflake', title: 'Cool down',
    text: isHard || isLong
      ? 'Last 5–10 min should be easy spinning to flush the legs. Off the bike: 10–15 min stretching while still warm — quads, hamstrings, hip flexors, lower back.'
      : '5–10 min of gentle stretching after the ride while you’re still warm. Quads, hamstrings, calves are the big three.',
  });

  if (isLong) {
    tips.push({
      category: 'recovery', icon: 'silverware-fork-knife', title: 'Recovery — eat, drink, sleep',
      text: 'Eat a proper meal within 30 min — carbs, protein, salt. Rehydrate gradually: 500–750 ml in the first hour. Earlier night than usual; most repair happens in deep sleep.',
    });
  } else if (isHard) {
    tips.push({
      category: 'recovery', icon: 'silverware-fork-knife', title: 'Recovery — eat, drink, sleep',
      text: 'Within 30 min, 20–25 g protein with carbs. Sip steadily through the afternoon. Make tomorrow’s ride genuinely easy or rest — hard back-to-backs dig the hole deeper than they fill it.',
    });
  }

  tips.push({
    category: 'injury',
    icon: isRecovery ? 'heart-pulse' : 'shield-check-outline',
    title: isRecovery ? 'Stay easy' : 'Watch for',
    text: isHard
      ? 'Cadence dropping below 80 rpm under load grinds the knees. If a knee or hip starts a sharp pain mid-effort, stop the session — don’t train through it.'
      : isLong
        ? 'Long rides surface bike-fit issues. Numb hands or feet → change hand position / loosen shoes. Lower-back tightness → stand up and pedal for 30 s every 20 min.'
        : isRecovery
          ? 'The session only works if you keep the effort genuinely easy. If your heart rate creeps above your easy zone, soft-pedal until it drops.'
          : 'A new niggle in a knee, hip, or back this week → ease back today, and book a physio if it’s still there next ride.',
  });

  return tips;
}

// ── Prompt builder ──────────────────────────────────────────────────────────
// Single user-message prompt; system prompt is supplied by the route so
// it can reuse the cached COACH_SYSTEM_PROMPT prefix. We intentionally
// pass *only* the fields the model needs — plan-wide context isn't
// useful for tips and would just bloat the request.
function buildTipsPrompt(activity, goal, userPrefs) {
  const summary = {
    title: activity?.title || null,
    subType: activity?.subType || null,
    description: activity?.description || null,
    durationMins: activity?.durationMins || null,
    distanceKm: activity?.distanceKm || null,
    effort: activity?.effort || null,
    bikeType: activity?.bikeType || null,
    structure: activity?.structure || null,
  };

  const goalLine = goal?.goalType
    ? `${goal.goalType}${goal.eventName ? ' (' + goal.eventName + ')' : ''}${goal.targetDistance ? ' · ' + goal.targetDistance + ' km' : ''}${goal.targetDate ? ' · target ' + goal.targetDate : ''}`
    : 'general fitness';

  const levelLine = userPrefs?.level ? `\nRider level: ${userPrefs.level}` : '';

  return `Produce ride tips for the rider's NEXT session. The tips must be specific to this session — its duration, effort, sub-type, and (if present) interval structure — not generic cycling advice.

Session:
${JSON.stringify(summary, null, 2)}

Goal: ${goalLine}${levelLine}

Required output: a JSON array (no surrounding object, no commentary, no code-fence) of 5–7 tip objects covering:
  - exactly one "warmup"
  - exactly one "hydration"
  - exactly one "fuel"
  - exactly one "pacing"
  - exactly one "cooldown"
  - one "recovery" ONLY if the session is hard (effort hard/max OR subType intervals/tempo) OR long (≥ 120 min). Skip otherwise.
  - exactly one "injury" — concrete things to watch for during this specific session shape.

Each tip must have this exact shape:
  { "category": "<one of: warmup, hydration, fuel, pacing, cooldown, recovery, injury>",
    "icon": "<one of the allowed icons below>",
    "title": "<short label, ≤ 4 words>",
    "text": "<2–4 sentences, plain English, no jargon, no emoji>" }

Allowed icons (use the canonical category icon unless there's a strong reason not to):
  - warmup → "arm-flex-outline"
  - hydration → "cup-water"
  - fuel → "food-apple-outline"
  - pacing → "speedometer" (or "speedometer-slow" for recovery sessions)
  - cooldown → "snowflake"
  - recovery → "silverware-fork-knife"
  - injury → "shield-check-outline" (or "heart-pulse" for recovery sessions)

HARD CONSTRAINTS:
- No emoji of any kind in titles or text.
- No medical advice. Never prescribe rest periods ("rest for 2 weeks"), medication, ice/heat, or diagnoses ("you have tendinitis"). For pain, only say "stop and book a physio".
- Stay session-specific. Quote concrete numbers from the structure / duration where useful (e.g. "in your 4×5-min threshold blocks, …"). Don't repeat the duration as a generic figure.
- Plain English. Beginners should understand it without a glossary.

Return ONLY the JSON array. No prose before or after.`;
}

module.exports = {
  ICON_ALLOWLIST,
  ALLOWED_CATEGORIES,
  CATEGORY_DEFAULT_ICON,
  sanitiseTips,
  buildDeterministicTips,
  buildTipsPrompt,
};
