/**
 * Period-aware recurring-todo helpers. Pure functions — pass `now` in so
 * the UI can always reflect "is this week's check done?" without any cron.
 *
 * Weeks run Monday → Sunday (founder's schedule).
 * Quarters are calendar quarters: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec.
 */

export type Cadence = "daily" | "weekly" | "monthly" | "quarterly";

/** First moment of the current period containing `now` for the given cadence. */
export function periodStart(cadence: Cadence, now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (cadence === "daily") return d;
  if (cadence === "weekly") {
    // Monday = 1, Sunday = 0. Shift back to Monday 00:00.
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() - (dow - 1));
    return d;
  }
  if (cadence === "monthly") {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  // quarterly
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

/** Is a recurring todo ticked for the current period? */
export function isDoneThisPeriod(
  lastCompletedAt: string | null,
  cadence: Cadence,
  now: Date = new Date(),
): boolean {
  if (!lastCompletedAt) return false;
  const last = new Date(lastCompletedAt);
  return last >= periodStart(cadence, now);
}

/** Human-readable next-due string for a recurring todo. */
export function nextDueLabel(cadence: Cadence, now: Date = new Date()): string {
  const start = periodStart(cadence, now);
  switch (cadence) {
    case "daily":     return "Resets tomorrow";
    case "weekly": {
      const nextMon = new Date(start);
      nextMon.setDate(nextMon.getDate() + 7);
      return `Resets Monday (${nextMon.toLocaleDateString("en-GB", { day: "numeric", month: "short" })})`;
    }
    case "monthly": {
      const nextFirst = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return `Resets 1st of ${nextFirst.toLocaleDateString("en-GB", { month: "long" })}`;
    }
    case "quarterly": {
      const nextQ = new Date(start.getFullYear(), start.getMonth() + 3, 1);
      return `Resets ${nextQ.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`;
    }
  }
}
