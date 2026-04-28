/**
 * Safety filters for the weekly check-in flow.
 *
 * Two layers:
 *   1. INPUT screening   — runs on the rider's free-text BEFORE any LLM call.
 *      If we hit crisis-language patterns, we abort suggestion generation
 *      entirely and return a crisis-resources block instead. The rider
 *      gets help, not a coach trying to fix a training plan.
 *
 *   2. OUTPUT screening  — runs on the LLM response AFTER it returns. If
 *      the coach drifted into medical advice (rest periods for medical
 *      conditions, ice, medication, treatment exercises), we strip the
 *      offending suggestion and replace it with a physio referral. Belt-
 *      and-braces for the system-prompt guardrails.
 *
 * Both filters are intentionally conservative — false positives (over-
 * triggering) are far better than false negatives. Tuned on the assumption
 * that any miss could harm a rider; any unnecessary trigger is just a
 * marginally less useful check-in that rider can shrug off.
 */

// ── Crisis-language patterns ─────────────────────────────────────────────
// Triggered against the rider's free-text answers BEFORE we ask Claude
// anything. If matched, we don't run suggestions; we return a
// crisis-resources card instead. Patterns lifted from the conservative
// end of common keyword lists used in mental-health adjacent products.
//
// Word-boundary anchored so "killer pace" and "die hard" don't match,
// but "I want to die" and "ending it all" do.
const CRISIS_PATTERNS = [
  /\b(want\s+to|going\s+to|gonna|want\s+to\s+just)\s+(die|kill\s+myself|end\s+it|end\s+my\s+life)\b/i,
  /\bsuicid(e|al)\b/i,
  /\b(self[\s-]?harm|cut\s+myself|hurt\s+myself|harming\s+myself)\b/i,
  /\b(end(ing)?\s+(it|my\s+life)\s+all?)\b/i,
  /\b(no\s+(point|reason)\s+(in\s+)?living)\b/i,
  /\b(better\s+off\s+dead)\b/i,
  /\b(can'?t\s+go\s+on)\b/i,
  /\b(want\s+to\s+disappear)\b/i,
];

// Free-text fields on the responses that we screen.
const TEXT_FIELDS = ['modifications', 'lifeEvents'];

/**
 * Scan rider responses for crisis language.
 * Returns { matched: boolean, snippet?: string }. Snippet is the
 * specific phrase that triggered (truncated for log safety) — useful for
 * debugging false positives, never returned to the rider or LLM.
 */
function detectCrisisInput(responses) {
  const fields = [];
  for (const k of TEXT_FIELDS) {
    if (typeof responses?.[k] === 'string' && responses[k].trim()) fields.push(responses[k]);
  }
  // Also screen per-session comments — riders may bury hard things in there.
  const comments = responses?.sessionComments;
  if (comments && typeof comments === 'object') {
    for (const v of Object.values(comments)) {
      if (typeof v === 'string' && v.trim()) fields.push(v);
    }
  }
  // And the injury description — sensitive content can land here.
  if (typeof responses?.injury?.description === 'string') fields.push(responses.injury.description);

  for (const text of fields) {
    for (const re of CRISIS_PATTERNS) {
      const m = text.match(re);
      if (m) return { matched: true, snippet: text.slice(0, 80) };
    }
  }
  return { matched: false };
}

/**
 * Crisis-resources payload — what we return INSTEAD of running Claude
 * suggestions when the screen matches. Resources are deliberately
 * generic (international helpline + UK Samaritans) and the copy
 * acknowledges the rider, doesn't try to fix anything.
 *
 * The shape mirrors the normal `suggestions` object so the client can
 * detect this state via the `crisisResources` boolean.
 */
function crisisResourcesPayload() {
  return {
    crisisResources: true,
    summary: "Something you wrote stood out to me, and I'd be a bad coach if I tried to fix a training plan over it. Please talk to someone who can help.",
    physioRecommended: false,
    changes: [],
    resources: [
      { label: 'Samaritans (UK, 24/7)', detail: 'Call 116 123 — free from any phone. Or email jo@samaritans.org.' },
      { label: 'Find a Helpline (worldwide)', detail: 'findahelpline.com — pick your country to find a local 24/7 service.' },
      { label: 'Crisis Text Line', detail: "In the US, UK, Canada, and Ireland: text HOME to your country's short code (see crisistextline.org)." },
    ],
  };
}

// ── Output screening — medical-advice drift ──────────────────────────────
// Patterns that indicate the model has stepped into medical territory.
// Tuned to catch advice the system prompt is supposed to forbid:
//   - Rest periods for a condition          ("rest for two weeks")
//   - Treatment / icing / heat              ("apply ice", "use a heat pack")
//   - Medication                            ("take ibuprofen", "anti-inflammatories")
//   - Exercises framed as healing           ("rehab exercises", "stretches for")
//   - Diagnoses                             ("you have", "this is patellar", "tendinitis")
//
// Word-boundary anchored. Conservative. If any pattern hits, we replace
// the offending sentence with a physio referral.
const NUMBER_WORDS = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|few|several|a\\s+couple\\s+of)';
const MEDICAL_DRIFT_PATTERNS = [
  // "Rest for two weeks", "rest 10 days" — both digit and word numbers.
  new RegExp(`\\brest\\s+(?:for|the)?\\s*${NUMBER_WORDS}\\s+(?:days?|weeks?)\\b`, 'i'),
  // Medication mentions, with or without "take/apply" preface.
  /\b(take|apply|use)?\s*(ibuprofen|paracetamol|acetaminophen|naproxen|aspirin|anti[\s-]?inflammator(y|ies)|nsaids?)\b/i,
  // Icing / heat. Catches "apply ice", "ice it", "icing the knee", "heat pack".
  /\b(apply|use)?\s*(ice(\s+(it|the|your|nightly|daily))?|icing|heat\s+pack|cold\s+pack|hot\s+pack)\b/i,
  /\b(ice|icing|heat)\s+(it|the\s+\w+|your\s+\w+|nightly|daily|every)/i,
  // Rehab / treatment exercises framed as healing.
  /\b(rehab(ilitation)?|treatment|recovery)\s+(exercises?|protocol|programme|program|plan|routine)\b/i,
  /\b(stretch(es|ing)?|mobility\s+exercises?)\s+(for|to\s+heal|to\s+treat|for\s+the\s+\w+)/i,
  // Diagnostic attempts.
  /\b(you\s+(?:have|might\s+have|probably\s+have|likely\s+have))\s+(tendinit?is|tendon|bursitis|strain|sprain|tear|fracture|patellar|itb|sciatica)\b/i,
  /\b(sounds?\s+like|likely)\s+(tendinit?is|patellar|itb|bursitis|sciatica)\b/i,
  /\b(diagnose|diagnos(is|ed))\b/i,
  /\b(prescrib(e|ed|ing))\b/i,
];

const PHYSIO_REFERRAL = 'Please see a physiotherapist — they can assess this properly. We\'ll shape the plan around their notes.';

/**
 * Sanitise an LLM-produced suggestion block.
 * Walks summary + every change.reason; replaces any field that hits a
 * medical-drift pattern. Returns a NEW object — never mutates the input.
 *
 * Side-channel `_sanitised` boolean is added when at least one field
 * was rewritten, so the caller can log / surface the fact.
 */
function sanitiseSuggestions(suggestions) {
  if (!suggestions || typeof suggestions !== 'object') return suggestions;
  let sanitised = false;

  const replaceIfDrift = (text) => {
    if (typeof text !== 'string') return text;
    for (const re of MEDICAL_DRIFT_PATTERNS) {
      if (re.test(text)) {
        sanitised = true;
        return PHYSIO_REFERRAL;
      }
    }
    return text;
  };

  const out = { ...suggestions };
  if (typeof suggestions.summary === 'string') {
    out.summary = replaceIfDrift(suggestions.summary);
  }
  if (Array.isArray(suggestions.changes)) {
    out.changes = suggestions.changes.map(c => ({
      ...c,
      reason: replaceIfDrift(c?.reason),
    }));
  }
  if (sanitised) out._sanitised = true;
  return out;
}

module.exports = {
  detectCrisisInput,
  crisisResourcesPayload,
  sanitiseSuggestions,
  // Exported for tests
  CRISIS_PATTERNS,
  MEDICAL_DRIFT_PATTERNS,
  PHYSIO_REFERRAL,
};
