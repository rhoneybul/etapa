/**
 * Unit conversion utilities — km ↔ miles.
 * The user's preferred unit ('km' or 'miles') is stored in local prefs.
 *
 * Canonical storage unit is ALWAYS kilometres — nothing in plans, goals,
 * activities, or the server API stores miles. Conversion happens purely at
 * render time via these helpers + the useUnits hook below.
 */

import { useEffect, useState } from 'react';
import { getUserPrefs } from '../services/storageService';

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

/**
 * Hook — returns the user's current unit preference and a bound
 * formatDistance helper. Components call `const { formatDistance } =
 * useUnits()` and then render `formatDistance(activity.distanceKm)`
 * instead of the historic `${activity.distanceKm} km`.
 *
 * Why not a React Context? Settings is the only place where the pref
 * changes, and changes there drive a navigation pop back to Home which
 * triggers the focus listener → load() → re-render, so screens pick
 * up the new unit the next time they render. A context would just add
 * indirection without buying us auto-sync we don't already have.
 */
export function useUnits() {
  const [units, setUnitsState] = useState('km');

  useEffect(() => {
    let alive = true;
    getUserPrefs()
      .then((p) => { if (alive) setUnitsState(p?.units || 'km'); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return {
    units,
    unit: distanceLabel(units),
    formatDistance: (km) => formatDistance(km, units),
    formatDistancePrecise: (km) => {
      const v = convertDistancePrecise(km, units);
      if (v === null) return '';
      return `${v} ${distanceLabel(units)}`;
    },
    convertDistance: (km) => convertDistance(km, units),
    convertDistancePrecise: (km) => convertDistancePrecise(km, units),
  };
}
