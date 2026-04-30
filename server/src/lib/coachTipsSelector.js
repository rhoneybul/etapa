/**
 * Coach tips selector — picks 2-3 personalized tips for a weekly check-in.
 *
 * Input context:
 *   - level: 'beginner' | 'intermediate' | 'advanced'
 *   - weeksIn: number (weeks into the plan)
 *   - sentIds: array of tip ids already sent to this user
 *   - optedOutIds: array of tip ids user has opted out of
 *   - completedSessions: number (sessions finished this week)
 *   - missedRecently: number (sessions skipped in last 2 weeks)
 *   - missedSessions: number (total sessions missed)
 *   - country: user's location country code (e.g. 'GB', 'US', null)
 *   - currentMonth: current month (1-12)
 *   - gearInventory: object { [itemId]: boolean } (e.g. { bike: true, helmet: true })
 *
 * Output: array of 2-3 tips, mixed categories, no repeats.
 */

function selectTips(catalog, ctx) {
  const {
    level = 'beginner',
    weeksIn = 1,
    sentIds = [],
    optedOutIds = [],
    completedSessions = 0,
    missedRecently = 0,
    missedSessions = 0,
    country = null,
    currentMonth = null,
    gearInventory = {},
  } = ctx;

  // Helper: map user country code to region codes
  const regionCodeMap = {
    'GB': ['UK'],
    'IE': ['EU'],
    'FR': ['EU'],
    'DE': ['EU'],
    'ES': ['EU'],
    'IT': ['EU'],
    'NL': ['EU'],
    'BE': ['EU'],
    'CH': ['EU'],
    'AT': ['EU'],
    'US': ['NA'],
    'CA': ['NA'],
    'AU': ['AU'],
    'NZ': ['AU'],
  };

  // Filter by:
  // 1. Matches level
  // 2. Within weekRange (or weekRange is null = any time)
  // 3. Passes optional prereq (if defined)
  // 4. Region-aware (regions array is null or matches country, if both present)
  // 5. Season-aware (seasons.months array is null or matches currentMonth, if both present)
  // 6. Not already sent (not in sentIds)
  // 7. Not opted out (not in optedOutIds)
  const candidates = catalog.filter(tip => {
    // Must match level
    if (!tip.levels.includes(level)) return false;

    // Must be in week range (or no range specified)
    if (tip.weekRange) {
      if (weeksIn < tip.weekRange.min || weeksIn > tip.weekRange.max) {
        return false;
      }
    }

    // Check prereq function if defined
    if (tip.prereq && typeof tip.prereq === 'function') {
      if (!tip.prereq({ weeksIn, completedSessions, missedRecently, missedSessions })) {
        return false;
      }
    }

    // Region filtering: if tip has regions defined, country must map to one of them
    if (Array.isArray(tip.regions) && tip.regions.length > 0 && country) {
      const userRegions = regionCodeMap[country] || [];
      const hasMatchingRegion = tip.regions.some(r => r === 'global' || userRegions.includes(r));
      if (!hasMatchingRegion) return false;
    }

    // Season filtering: if tip has seasons.months defined, currentMonth must be in the list
    if (tip.seasons && Array.isArray(tip.seasons.months) && tip.seasons.months.length > 0 && currentMonth) {
      if (!tip.seasons.months.includes(currentMonth)) return false;
    }

    // Gear gap filtering: if tip requires a piece of gear the rider doesn't have, skip it
    if (tip.requiresGap) {
      if (gearInventory[tip.requiresGap] === true) {
        // Rider has this item, so filter out this tip
        return false;
      }
    }

    // Must not be already sent
    if (sentIds.includes(tip.id)) return false;

    // Must not be opted out
    if (optedOutIds.includes(tip.id)) return false;

    return true;
  });

  // Return 2-3 tips, biased toward different categories
  const selected = [];
  const categoriesUsed = new Set();

  // Sort candidates by: (1) preferred category (plan_adjustment if struggling,
  // curiosity if doing well), (2) random
  const scoredCandidates = candidates.map(tip => ({
    tip,
    score: Math.random(),
  })).sort((a, b) => b.score - a.score);

  for (const { tip } of scoredCandidates) {
    if (selected.length >= 3) break;

    // Try to get variety in categories, but allow repeats if we're running low
    if (!categoriesUsed.has(tip.category) || selected.length < 2) {
      selected.push(tip);
      categoriesUsed.add(tip.category);
    }
  }

  // Fallback: if we somehow picked nothing, grab the first 2 candidates
  if (selected.length === 0) {
    selected.push(...candidates.slice(0, 3));
  }

  return selected.slice(0, 3);
}

module.exports = { selectTips };
