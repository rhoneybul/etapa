import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/speed-rules
 *
 * Returns the active speed rules (base speeds per level, subtype + effort
 * multipliers, hard caps) plus a worked example matrix showing the target
 * distance for common (level, subtype, duration) combinations.
 *
 * The rules come from server/src/lib/rideSpeedRules.js so the dashboard is
 * guaranteed to be displaying exactly what the server applies when it
 * normalises generated plans. If this endpoint and the server ever drift,
 * that's a bug.
 */
export async function GET() {
  // tests/dashboard → repo root is ../.. ; rules live under server/src/lib.
  const rulesPath = path.resolve(
    process.cwd(),
    '..',
    '..',
    'server',
    'src',
    'lib',
    'rideSpeedRules.js'
  );

  let rules;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    rules = require(rulesPath);
  } catch (err) {
    return Response.json(
      { error: `Could not load speed rules from ${rulesPath}: ${err.message}` },
      { status: 500 }
    );
  }

  const {
    BASE_AVG_SPEED_KMH,
    MAX_AVG_SPEED_KMH,
    MIN_AVG_SPEED_KMH,
    SUBTYPE_MULTIPLIER,
    EFFORT_MULTIPLIER,
    targetSpeedKmh,
    realisticDistanceKm,
  } = rules;

  // Build the worked-example matrix. Durations chosen to match what Claude
  // typically produces for each level.
  const durationsByLevel = {
    beginner:     [30, 45, 60, 75, 90],
    intermediate: [45, 60, 90, 120, 150],
    advanced:     [60, 90, 120, 150, 180],
    expert:       [60, 90, 120, 150, 180],
  };
  const subTypes = ['recovery', 'endurance', 'tempo', 'intervals'];

  const matrix = {};
  for (const level of Object.keys(BASE_AVG_SPEED_KMH)) {
    matrix[level] = {};
    for (const subType of subTypes) {
      matrix[level][subType] = durationsByLevel[level].map((mins) => {
        const effort =
          subType === 'recovery' ? 'recovery'
          : subType === 'tempo' ? 'moderate'
          : subType === 'intervals' ? 'hard'
          : 'easy';
        return {
          durationMins: mins,
          distanceKm: realisticDistanceKm({
            durationMins: mins,
            fitnessLevel: level,
            subType,
            effort,
          }),
          targetSpeedKmh: Number(
            targetSpeedKmh({ fitnessLevel: level, subType, effort }).toFixed(2)
          ),
        };
      });
    }
    // Long ride row: use isLongRide flag on the level's longest typical duration.
    const longRideMins = durationsByLevel[level][durationsByLevel[level].length - 1];
    matrix[level].long_ride = [{
      durationMins: longRideMins,
      distanceKm: realisticDistanceKm({
        durationMins: longRideMins,
        fitnessLevel: level,
        subType: 'endurance',
        effort: 'easy',
        isLongRide: true,
      }),
      targetSpeedKmh: Number(
        targetSpeedKmh({
          fitnessLevel: level,
          subType: 'endurance',
          effort: 'easy',
          isLongRide: true,
        }).toFixed(2)
      ),
    }];
  }

  return Response.json({
    levels: Object.keys(BASE_AVG_SPEED_KMH),
    baseSpeeds: BASE_AVG_SPEED_KMH,
    maxSpeeds: MAX_AVG_SPEED_KMH,
    minSpeeds: MIN_AVG_SPEED_KMH,
    subTypeMultipliers: SUBTYPE_MULTIPLIER,
    effortMultipliers: EFFORT_MULTIPLIER,
    subTypes: [...subTypes, 'long_ride'],
    durationsByLevel,
    matrix,
  });
}
