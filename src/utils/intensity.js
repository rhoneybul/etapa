/**
 * Intensity formatters — turn the raw structure.main.intensity block from
 * a plan activity into display strings suited to the user's equipment.
 *
 * The design goal: give every rider a target they can actually hit.
 *   - Every rider sees RPE + sensory cue (needs no equipment)
 *   - Riders with a heart-rate monitor see bpm ranges (when max HR set)
 *   - Riders with a power meter see watt ranges (when FTP set)
 *
 * If max HR / FTP aren't set, fall back to % ranges so the target is
 * still meaningful for anyone who knows roughly what zone 4 feels like.
 */

// ── Heart rate ────────────────────────────────────────────────────────────
// Given {hrZone, hrPctOfMaxLow, hrPctOfMaxHigh} and optional userPrefs.maxHr,
// returns a string like "Zone 4 · 158–174 bpm" or "Zone 4 · 85–92% of max"
// when no max HR is set.
export function formatHeartRate(intensity, userPrefs) {
  if (!intensity) return null;
  const { hrZone, hrPctOfMaxLow, hrPctOfMaxHigh } = intensity;
  if (hrPctOfMaxLow == null || hrPctOfMaxHigh == null) return null;
  const zone = hrZone ? `Zone ${hrZone}` : 'HR';
  const maxHr = userPrefs?.maxHr;
  if (maxHr) {
    const low = Math.round((maxHr * hrPctOfMaxLow) / 100);
    const high = Math.round((maxHr * hrPctOfMaxHigh) / 100);
    return `${zone} · ${low}–${high} bpm`;
  }
  return `${zone} · ${hrPctOfMaxLow}–${hrPctOfMaxHigh}% of max HR`;
}

// ── Power ─────────────────────────────────────────────────────────────────
// Returns "Zone 4 · 245–270W" or "Zone 4 · 91–105% of FTP", or null if the
// intensity block has no power info. If FTP isn't set the % fallback still
// renders — users who have a meter but never entered FTP still benefit.
export function formatPower(intensity, userPrefs) {
  if (!intensity) return null;
  const { powerZone, powerPctOfFtpLow, powerPctOfFtpHigh } = intensity;
  if (powerPctOfFtpLow == null || powerPctOfFtpHigh == null) return null;
  const zone = powerZone ? `Zone ${powerZone}` : 'Power';
  const ftp = userPrefs?.ftp;
  if (ftp) {
    const low = Math.round((ftp * powerPctOfFtpLow) / 100);
    const high = Math.round((ftp * powerPctOfFtpHigh) / 100);
    return `${zone} · ${low}–${high}W`;
  }
  return `${zone} · ${powerPctOfFtpLow}–${powerPctOfFtpHigh}% of FTP`;
}

// ── Perceived effort ──────────────────────────────────────────────────────
// Always renders — RPE needs no equipment. Returns the numeric rating and
// cue as a single line e.g. "8/10 — Hard, short breaths, one-word answers".
export function formatRpe(intensity) {
  if (!intensity) return null;
  const { rpe, rpeCue } = intensity;
  if (rpe == null) return null;
  const num = `${rpe}/10`;
  return rpeCue ? `${num} — ${rpeCue}` : num;
}

// ── Power "should render" guard ───────────────────────────────────────────
// Hide the power line entirely when the user has no FTP AND the structure
// block looks like a beginner session (no power info generated). Prevents
// confusing users who never set FTP with "% of FTP" lines they can't use.
export function shouldShowPower(intensity, userPrefs) {
  if (!intensity) return false;
  const hasPowerInfo = intensity.powerPctOfFtpLow != null && intensity.powerPctOfFtpHigh != null;
  if (!hasPowerInfo) return false;
  // Always show if user has FTP — they can use it.
  if (userPrefs?.ftp) return true;
  // Without FTP we still show the % fallback — it's useful context for
  // anyone who knows what "around FTP" means. Beginners with no FTP AND
  // no hard sessions won't see this block at all because their plans
  // never generate intensity structures.
  return true;
}
