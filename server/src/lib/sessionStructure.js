/**
 * Session structure helpers — the canonical shape for a "how to do this
 * session" breakdown, plus deterministic defaults used by the post-processor
 * when Claude forgets to produce structure for a hard session.
 *
 * Why the triple RPE + HR% + power%?
 * Beginners don't have a heart-rate monitor, intermediate athletes have a
 * strap, advanced users have a power meter. If we pick one reference frame
 * we alienate two-thirds of the user base. Rendering all three (and the
 * client hides power when the user hasn't entered an FTP) means every
 * rider can map the target to something they can actually measure.
 *
 * Canonical shape:
 *
 *   structure: {
 *     warmup:   { durationMins, description, effort }   // effort: 'easy' | 'recovery'
 *     main: {
 *       type:         'intervals' | 'tempo' | 'steady',
 *       reps?:        number,           // intervals only
 *       workMins?:    number,           // intervals only — length of one hard rep
 *       restMins?:    number,           // intervals only — recovery between reps
 *       blockMins?:   number,           // tempo / steady — length of the sustained effort
 *       description:  string,           // plain-English coaching cue
 *       intensity: {
 *         rpe:            number,       // 1–10
 *         rpeCue:         string,       // sensory cue — breathing / talking / legs
 *         hrZone:         number,       // 1–5 (Coggan/Friel style)
 *         hrPctOfMaxLow:  number,       // % of max HR — range low
 *         hrPctOfMaxHigh: number,       // % of max HR — range high
 *         powerZone:      number,       // 1–7 (Coggan)
 *         powerPctOfFtpLow:  number,    // % of FTP — range low (null if not applicable)
 *         powerPctOfFtpHigh: number,    // % of FTP — range high (null if not applicable)
 *       }
 *     }
 *     cooldown: { durationMins, description, effort }
 *   }
 *
 * Totals: warmup + main + cooldown should approximately equal durationMins on
 * the activity. We do NOT enforce this server-side because Claude can legitimately
 * choose an open-ended cooldown / warmup length.
 */

// ── Intensity presets by training target ──────────────────────────────────
// Standard sports-science ranges. RPE cues are written in plain English so
// a beginner can actually use them.
const INTENSITY_PRESETS = {
  recovery: {
    rpe: 2, rpeCue: 'Very easy — you could sing. Barely feels like a workout.',
    hrZone: 1, hrPctOfMaxLow: 50, hrPctOfMaxHigh: 60,
    powerZone: 1, powerPctOfFtpLow: 40, powerPctOfFtpHigh: 55,
  },
  easy: {
    rpe: 3, rpeCue: 'Conversational — full sentences with no effort. Nose-breathing comfortable.',
    hrZone: 2, hrPctOfMaxLow: 60, hrPctOfMaxHigh: 70,
    powerZone: 2, powerPctOfFtpLow: 55, powerPctOfFtpHigh: 75,
  },
  tempo: {
    rpe: 6, rpeCue: 'Comfortably hard — can still talk but in short sentences. Focused, not chatty.',
    hrZone: 3, hrPctOfMaxLow: 75, hrPctOfMaxHigh: 85,
    powerZone: 3, powerPctOfFtpLow: 76, powerPctOfFtpHigh: 90,
  },
  threshold: {
    rpe: 7, rpeCue: 'Hard but sustainable for ~20 minutes. One-word answers. Deep, rhythmic breathing.',
    hrZone: 4, hrPctOfMaxLow: 84, hrPctOfMaxHigh: 92,
    powerZone: 4, powerPctOfFtpLow: 91, powerPctOfFtpHigh: 105,
  },
  vo2: {
    rpe: 9, rpeCue: 'Very hard — heavy breathing, can\'t talk, legs burning. Just barely holding it.',
    hrZone: 5, hrPctOfMaxLow: 92, hrPctOfMaxHigh: 100,
    powerZone: 5, powerPctOfFtpLow: 106, powerPctOfFtpHigh: 120,
  },
  anaerobic: {
    rpe: 10, rpeCue: 'All-out. Gasping. Can only hold this for 30–90 seconds.',
    hrZone: 5, hrPctOfMaxLow: 95, hrPctOfMaxHigh: 100,
    powerZone: 6, powerPctOfFtpLow: 121, powerPctOfFtpHigh: 150,
  },
};

// Which preset matches a given (subType, effort) combination.
// Beginners never see this because their sessions are all easy / recovery.
function presetForActivity(subType, effort) {
  if (effort === 'recovery') return INTENSITY_PRESETS.recovery;
  if (subType === 'intervals' && (effort === 'hard' || effort === 'max')) {
    // Default interval target is threshold; shorter-rep intervals would be
    // vo2 but we only know that from workMins. Caller can override via
    // buildStructureFor(...).
    return INTENSITY_PRESETS.threshold;
  }
  if (subType === 'tempo' || effort === 'moderate') return INTENSITY_PRESETS.tempo;
  if (effort === 'hard') return INTENSITY_PRESETS.threshold;
  if (effort === 'max') return INTENSITY_PRESETS.vo2;
  return INTENSITY_PRESETS.easy;
}

// ── Should this activity have a structure block? ───────────────────────────
// Only sessions where intensity actually matters. An easy endurance spin
// doesn't need a "main set" — the title + description is enough.
function shouldHaveStructure(activity) {
  if (!activity || activity.type !== 'ride') return false;
  const hard = activity.effort === 'hard' || activity.effort === 'max';
  const structured = activity.subType === 'intervals' || activity.subType === 'tempo';
  return hard || structured;
}

// ── Synthesise a default structure when Claude didn't produce one ──────────
// Used by the post-processor. The idea is that even a fallback structure is
// better than "4×4 hard" with no context — we parse what we can from the
// title/description, fill the rest with sensible defaults for the target
// type, and emit a violations entry so we can see how often we're fallback-
// generating vs getting good output from the LLM.
function buildStructureFor(activity) {
  const subType = activity.subType || 'endurance';
  const effort = activity.effort || 'easy';
  const total = Number(activity.durationMins) || 60;

  // Parse "4x4 min" / "5 x 3 min" / "8×30 sec" / "3×6 minutes" patterns
  // from the title or description so we honour what Claude explicitly told
  // the user. We handle both minutes and seconds because real plans mix
  // VO2 / sprint work (30–90s reps) with threshold work (3–15 min reps).
  const text = `${activity.title || ''} ${activity.description || ''}`.toLowerCase();
  // Seconds first (more specific pattern — "8x30sec" / "8 × 30 s")
  const repSecMatch = text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:sec|seconds?|s\b)/);
  const repMinMatch = text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:min|minute|minutes|m\b)/);
  let parsedReps = null;
  let parsedWorkMins = null;
  if (repSecMatch) {
    parsedReps = parseInt(repSecMatch[1], 10);
    parsedWorkMins = parseFloat(repSecMatch[2]) / 60; // convert seconds to minutes
  } else if (repMinMatch) {
    parsedReps = parseInt(repMinMatch[1], 10);
    parsedWorkMins = parseFloat(repMinMatch[2]);
  }

  if (subType === 'intervals' || effort === 'hard' || effort === 'max') {
    // VO2 territory: 30–90s reps. Threshold: 3–15min reps. Heuristic on
    // parsed work length — short = vo2, long = threshold.
    const workMins = parsedWorkMins ?? 4;
    const reps = parsedReps ?? 4;
    const preset = workMins <= 2 ? INTENSITY_PRESETS.vo2 : INTENSITY_PRESETS.threshold;
    // Recovery roughly equal to work for threshold, longer for vo2.
    const restMins = workMins <= 2 ? Math.max(2, workMins * 2) : workMins;

    const workTotal = reps * (workMins + restMins);
    const warmMins = Math.max(10, Math.min(20, Math.round((total - workTotal) * 0.55)));
    const coolMins = Math.max(5, Math.min(15, total - workTotal - warmMins));

    return {
      warmup: {
        durationMins: warmMins,
        description: 'Easy spinning, gradually bringing the heart rate up. Add 2–3 short 30-second openers near the end of the warm-up so the first hard rep doesn\'t feel like a shock.',
        effort: 'easy',
      },
      main: {
        type: 'intervals',
        reps,
        workMins,
        restMins,
        description: `${reps} × ${workMins} min at the target intensity, ${restMins} min easy spinning between each rep. Keep the effort consistent — if rep ${reps} falls off noticeably, your target was too high. Better to nail ${reps - 1} than blow up the last one.`,
        intensity: preset,
      },
      cooldown: {
        durationMins: coolMins,
        description: 'Easy spinning to flush the legs. Stop the timer, let the heart rate drift back down.',
        effort: 'easy',
      },
    };
  }

  if (subType === 'tempo' || effort === 'moderate') {
    // Tempo is usually 2×15–20 min or one 20–40 min block.
    const blockMins = Math.max(15, Math.min(40, Math.round(total * 0.5)));
    const warmMins = Math.max(10, Math.round((total - blockMins) * 0.55));
    const coolMins = Math.max(5, total - blockMins - warmMins);
    return {
      warmup: {
        durationMins: warmMins,
        description: 'Build gradually from easy to the lower edge of tempo so the first block isn\'t a jolt.',
        effort: 'easy',
      },
      main: {
        type: 'tempo',
        blockMins,
        description: `${blockMins} min sustained at tempo. You should feel you\'re working, but not struggling — think "comfortably uncomfortable". If you\'re gasping, ease off.`,
        intensity: INTENSITY_PRESETS.tempo,
      },
      cooldown: {
        durationMins: coolMins,
        description: 'Easy spinning. Let the legs unwind before stepping off the bike.',
        effort: 'easy',
      },
    };
  }

  return null; // easy/recovery/long don't need a breakdown
}

// ── Validate that a structure block Claude produced is well-formed ────────
// Used by the post-processor to decide whether to keep Claude's output or
// replace with buildStructureFor(). Accepts any block that has enough
// fields to render usefully; we're not strict about every optional key.
function isValidStructure(s) {
  if (!s || typeof s !== 'object') return false;
  if (!s.main || typeof s.main !== 'object') return false;
  const i = s.main.intensity;
  if (!i || typeof i !== 'object') return false;
  if (typeof i.rpe !== 'number') return false;
  if (typeof i.hrPctOfMaxLow !== 'number' || typeof i.hrPctOfMaxHigh !== 'number') return false;
  return true;
}

// ── Post-processor stage ───────────────────────────────────────────────────
// Invoked from runAll. Adds structure to any activity that should have one
// and doesn't. Never destroys Claude's own output when it's well-formed.
function enforceSessionStructure(acts, goal, config) {
  const violations = [];
  if (!Array.isArray(acts)) return { activities: acts, violations };

  const next = acts.map((a) => {
    if (!shouldHaveStructure(a)) return a;
    if (isValidStructure(a.structure)) return a; // keep Claude's version
    const synthesised = buildStructureFor(a);
    if (!synthesised) return a;
    violations.push({
      severity: 'info',
      message: `synthesised structure for "${a.title}" (week ${a.week}, ${a.subType}/${a.effort})`,
    });
    return { ...a, structure: synthesised };
  });

  return { activities: next, violations };
}

module.exports = {
  INTENSITY_PRESETS,
  presetForActivity,
  shouldHaveStructure,
  buildStructureFor,
  isValidStructure,
  enforceSessionStructure,
};
