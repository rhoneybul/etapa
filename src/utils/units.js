/**
 * Unit conversion utilities — km ↔ miles.
 * The user's preferred unit ('km' or 'miles') is stored in local prefs.
 */

const KM_TO_MILES = 0.621371;

/**
 * Convert a km value for display based on the user's preferred unit.
 * Returns a rounded number.
 */
export function convertDistance(km, units) {
  if (!km && km !== 0) return null;
  if (units === 'miles') return Math.round(km * KM_TO_MILES);
  return Math.round(km);
}

/**
 * Convert a km value with one decimal place.
 */
export function convertDistancePrecise(km, units) {
  if (!km && km !== 0) return null;
  if (units === 'miles') return Math.round(km * KM_TO_MILES * 10) / 10;
  return Math.round(km * 10) / 10;
}

/**
 * Get the short label for the active unit.
 */
export function distanceLabel(units) {
  return units === 'miles' ? 'mi' : 'km';
}

/**
 * Get the full label for the active unit.
 */
export function distanceLabelFull(units) {
  return units === 'miles' ? 'miles' : 'km';
}

/**
 * Format a distance with its unit label, e.g. "42 km" or "26 mi".
 */
export function formatDistance(km, units) {
  const val = convertDistance(km, units);
  if (val === null) return '';
  return `${val} ${distanceLabel(units)}`;
}
