/**
 * Workout export — converts an Etapa session into structured workout files
 * that smart trainers and indoor cycling apps can execute.
 *
 * Two output formats:
 *   • ZWO  (Zwift Workout) — XML, accepted by Zwift, Rouvy, MyWhoosh,
 *           Wahoo SYSTM, TrainerRoad import. The dominant standard for
 *           indoor structured workouts. Power targets are expressed as
 *           fractions of FTP (e.g. 0.95 = 95% FTP) — the rider's FTP is
 *           configured on the device side, so we don't need it to generate
 *           the file.
 *   • MRC  (CompuTrainer text format) — line-based plain text, ancient
 *           but supported as a universal fallback by trainer software
 *           that doesn't take ZWO. Power targets are also % FTP.
 *
 * Both formats are pure functions of the activity. Same input → same file.
 *
 * The activity's `structure` block (warmup / main / cooldown) is the
 * preferred source. When it's missing — for endurance, easy, recovery,
 * and steady indoor sessions — we fall back to a single steady-state
 * block sized from the activity's effort label and durationMins.
 *
 * No external deps. Pure string templating.
 */

// Default FTP percentage ranges per effort label. Lifted from the Coggan
// table referenced in the plan-gen system prompt so this file matches
// what the rest of the app teaches.
const EFFORT_FTP_RANGE = {
  recovery:  [0.40, 0.55],
  easy:      [0.55, 0.75],
  moderate:  [0.65, 0.85],
  hard:      [0.91, 1.05],
  max:       [1.06, 1.20],
};

// Pick a midpoint of a range as the steady target.
function midpoint([lo, hi]) {
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

// Pull a power range from an explicit intensity object on the structure
// block, or fall back to the effort label's defaults. Always returns
// [lo, hi] as fractions of FTP.
function rangeFromIntensity(intensity, effortFallback = 'easy') {
  if (intensity && intensity.powerPctOfFtpLow != null && intensity.powerPctOfFtpHigh != null) {
    return [intensity.powerPctOfFtpLow / 100, intensity.powerPctOfFtpHigh / 100];
  }
  return EFFORT_FTP_RANGE[effortFallback] || EFFORT_FTP_RANGE.easy;
}

// Build a sequence of "blocks" from the activity. Each block is one of:
//   { kind: 'warmup',    seconds, powerLow, powerHigh, label }
//   { kind: 'cooldown',  seconds, powerLow, powerHigh, label }
//   { kind: 'steady',    seconds, power,                  label }
//   { kind: 'intervals', reps, onSeconds, offSeconds, onPower, offPower, label }
//
// This is the format both the ZWO writer and the MRC writer consume, so
// the format-specific code stays small.
function blocksForActivity(activity) {
  const blocks = [];
  const struct = activity?.structure || null;

  // ── Steady-state fallback when no structure is provided ─────────────
  if (!struct || (!struct.warmup && !struct.main && !struct.cooldown)) {
    const effort = (activity?.effort || 'easy').toLowerCase();
    const dur = Math.max(60, (activity?.durationMins || 60) * 60);
    const range = EFFORT_FTP_RANGE[effort] || EFFORT_FTP_RANGE.easy;
    blocks.push({
      kind: 'steady',
      seconds: dur,
      power: midpoint(range),
      label: activity?.title || 'Steady ride',
    });
    return blocks;
  }

  // ── Warmup ──────────────────────────────────────────────────────────
  if (struct.warmup) {
    const w = struct.warmup;
    blocks.push({
      kind: 'warmup',
      seconds: Math.max(60, (w.durationMins || 10) * 60),
      powerLow: 0.45,
      powerHigh: 0.65,
      label: w.description || 'Warm up',
    });
  }

  // ── Main set ────────────────────────────────────────────────────────
  if (struct.main) {
    const m = struct.main;
    const [lo, hi] = rangeFromIntensity(m.intensity, activity?.effort || 'moderate');
    const targetPower = midpoint([lo, hi]);

    if (m.type === 'intervals' && m.reps && m.workMins) {
      // Recovery between intervals — pick the easy zone midpoint.
      const restPower = midpoint(EFFORT_FTP_RANGE.easy);
      blocks.push({
        kind: 'intervals',
        reps: m.reps,
        onSeconds: Math.max(30, m.workMins * 60),
        offSeconds: Math.max(30, (m.restMins || 2) * 60),
        onPower: targetPower,
        offPower: restPower,
        label: m.description || `${m.reps} × ${m.workMins} min`,
      });
    } else if ((m.type === 'tempo' || m.type === 'steady') && m.blockMins) {
      blocks.push({
        kind: 'steady',
        seconds: Math.max(60, m.blockMins * 60),
        power: targetPower,
        label: m.description || (m.type === 'tempo' ? 'Tempo block' : 'Steady block'),
      });
    } else {
      // Unknown main type — best effort: a single steady block sized to
      // whatever's left of the session after warmup + cooldown.
      const used = (struct.warmup?.durationMins || 0) + (struct.cooldown?.durationMins || 0);
      const remaining = Math.max(0, (activity?.durationMins || 60) - used);
      blocks.push({
        kind: 'steady',
        seconds: Math.max(60, remaining * 60),
        power: targetPower,
        label: m.description || 'Main set',
      });
    }
  }

  // ── Cooldown ────────────────────────────────────────────────────────
  if (struct.cooldown) {
    const c = struct.cooldown;
    blocks.push({
      kind: 'cooldown',
      seconds: Math.max(60, (c.durationMins || 5) * 60),
      powerLow: 0.55,
      powerHigh: 0.40,
      label: c.description || 'Cool down',
    });
  }

  return blocks;
}

// Crude but sufficient XML escape for the ZWO writer. ZWO files don't
// support a wide range of unicode well in some apps, so we also strip
// emoji and non-printable characters.
function xmlEscape(s) {
  return String(s || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '') // surrogate pairs (most emoji)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build a Zwift Workout (.zwo) XML string for the given activity.
 *
 * Author / sport / category fields are static — Zwift only really cares
 * about the <workout> block. Description includes session notes so the
 * user sees Etapa's coaching context inside Zwift.
 */
function toZwo(activity) {
  const name = xmlEscape(activity?.title || 'Etapa Session');
  const description = xmlEscape(
    [activity?.description, activity?.notes].filter(Boolean).join('\n\n')
    || 'Etapa indoor session'
  );

  const blocks = blocksForActivity(activity);
  const xml = blocks.map(b => {
    if (b.kind === 'warmup') {
      return `    <Warmup Duration="${b.seconds}" PowerLow="${b.powerLow}" PowerHigh="${b.powerHigh}"><textevent timeoffset="0" message="${xmlEscape(b.label)}"/></Warmup>`;
    }
    if (b.kind === 'cooldown') {
      return `    <Cooldown Duration="${b.seconds}" PowerLow="${b.powerLow}" PowerHigh="${b.powerHigh}"><textevent timeoffset="0" message="${xmlEscape(b.label)}"/></Cooldown>`;
    }
    if (b.kind === 'steady') {
      return `    <SteadyState Duration="${b.seconds}" Power="${b.power}"><textevent timeoffset="0" message="${xmlEscape(b.label)}"/></SteadyState>`;
    }
    if (b.kind === 'intervals') {
      return `    <IntervalsT Repeat="${b.reps}" OnDuration="${b.onSeconds}" OffDuration="${b.offSeconds}" OnPower="${b.onPower}" OffPower="${b.offPower}"><textevent timeoffset="0" message="${xmlEscape(b.label)}"/></IntervalsT>`;
    }
    return '';
  }).filter(Boolean).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
  <author>Etapa</author>
  <name>${name}</name>
  <description>${description}</description>
  <sportType>bike</sportType>
  <tags/>
  <workout>
${xml}
  </workout>
</workout_file>
`;
}

/**
 * Build a CompuTrainer-style MRC (.mrc) text string. MRC is a flat
 * timeline of (minutes, %FTP) waypoints — every smart trainer app
 * that imports a workout has supported this for 20+ years, so it's a
 * safe universal fallback for anything that doesn't take ZWO.
 */
function toMrc(activity) {
  const name = activity?.title || 'Etapa Session';
  const description = (activity?.description || '').replace(/[\r\n]+/g, ' ');

  const blocks = blocksForActivity(activity);

  // Flatten blocks into a stream of (minutesElapsed, %FTP) points. MRC
  // expects two consecutive points per block — start and end — and
  // renders linear interpolation between them.
  const points = [];
  let t = 0;
  const push = (minutes, pct) => {
    points.push([Number(minutes.toFixed(2)), Math.round(pct)]);
  };

  for (const b of blocks) {
    const minutes = b.seconds / 60;
    if (b.kind === 'warmup' || b.kind === 'cooldown') {
      push(t, b.powerLow * 100);
      t += minutes;
      push(t, b.powerHigh * 100);
    } else if (b.kind === 'steady') {
      push(t, b.power * 100);
      t += minutes;
      push(t, b.power * 100);
    } else if (b.kind === 'intervals') {
      for (let i = 0; i < b.reps; i++) {
        const onMin = b.onSeconds / 60;
        push(t, b.onPower * 100);
        t += onMin;
        push(t, b.onPower * 100);
        // Skip the trailing rest after the final rep — keeps the file
        // tidy and matches what most apps expect.
        if (i < b.reps - 1) {
          const offMin = b.offSeconds / 60;
          push(t, b.offPower * 100);
          t += offMin;
          push(t, b.offPower * 100);
        }
      }
    }
  }

  // Canonical CompuTrainer MRC header. Apps that read MRC (TrainerRoad,
  // PerfPro, GoldenCheetah, ErgVideo, legacy CompuTrainer software) all
  // expect this exact set of fields. We deliberately omit the non-standard
  // FTP field — power targets in MRC are always rendered as % of FTP and
  // the trainer software resolves the absolute watts from the rider's
  // configured FTP, not from the file.
  const lines = [];
  lines.push('[COURSE HEADER]');
  lines.push('VERSION = 2');
  lines.push('UNITS = ENGLISH');
  lines.push(`DESCRIPTION = ${description || name}`);
  lines.push('FILE NAME = etapa.mrc');
  lines.push('MINUTES PERCENT');
  lines.push('[END COURSE HEADER]');
  lines.push('[COURSE DATA]');
  for (const [m, p] of points) {
    lines.push(`${m.toFixed(2)}\t${p}`);
  }
  lines.push('[END COURSE DATA]');
  return lines.join('\n') + '\n';
}

/**
 * Filename suggestion for an exported file. Lower-cases the title,
 * strips most punctuation, joins with dashes, caps at 60 chars.
 * Example: "Etapa — VO2max 5 × 3" → "etapa-vo2max-5-3.zwo"
 */
function suggestedFilename(activity, ext) {
  const raw = (activity?.title || 'etapa-session');
  const slug = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'etapa-session';
  return `${slug}.${ext}`;
}

module.exports = { toZwo, toMrc, suggestedFilename, blocksForActivity };
