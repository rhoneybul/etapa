/**
 * Pure calculation helpers — no DB, no state, no side effects.
 *
 * Everything in here is trivially testable and is the only place where
 * financial maths lives. Display components call these; data is read from
 * Supabase (via TanStack Query or server components) and passed in.
 */

export type Zone = "green" | "amber" | "red";

/**
 * Runway zone per the Red Zones sheet in the Excel model:
 *   >6 months → green
 *   3-6      → amber
 *   <3       → red
 *
 * Null runway (no burn data yet) counts as amber — we don't know enough to
 * paint it green and we shouldn't scare the user by painting it red.
 */
export function runwayZone(months: number | null): Zone {
  if (months == null) return "amber";
  if (months < 3) return "red";
  if (months < 6) return "amber";
  return "green";
}

/**
 * Cash-balance zone per Red Zones sheet: <£500 red, <£1,500 amber.
 */
export function cashZone(gbp: number | null): Zone {
  if (gbp == null) return "amber";
  if (gbp < 500) return "red";
  if (gbp < 1500) return "amber";
  return "green";
}

/**
 * Format pounds with no decimals for KPI tiles, one decimal for small values.
 */
export function fmtGBP(v: number | null | undefined, opts?: { decimals?: number }): string {
  if (v == null) return "—";
  const decimals = opts?.decimals ?? (Math.abs(v) < 100 ? 2 : 0);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

/**
 * "15.3 months" — used in the runway KPI. Infinity runway (zero burn) shows
 * as "∞" because "Infinity months" is silly.
 */
export function fmtMonths(m: number | null | undefined): string {
  if (m == null) return "—";
  if (!isFinite(m)) return "∞";
  return `${m.toFixed(1)} mo`;
}

/**
 * Percentage formatter for the delta indicators on KPI tiles.
 */
export function fmtPctDelta(pct: number | null): string {
  if (pct == null) return "—";
  const sign = pct > 0 ? "▲" : pct < 0 ? "▼" : "•";
  return `${sign} ${Math.abs(pct).toFixed(1)}%`;
}

/**
 * Red Zones — hardcoded from the Excel `Red Zones` sheet per spec §14.
 * Each row drives an alert banner when its metric crosses into amber or
 * red. Actions below are the pre-committed responses from the sheet.
 */
export type RedZoneRule = {
  id: string;
  label: string;
  unit: "months" | "gbp" | "pct" | "count";
  amber: number;
  red: number;
  direction: "lower_is_worse" | "higher_is_worse";
  action: string;
};

export const RED_ZONE_RULES: RedZoneRule[] = [
  {
    id: "runway_actual",
    label: "Runway (actual burn)",
    unit: "months",
    amber: 6,
    red: 3,
    direction: "lower_is_worse",
    action: "Inject founder capital OR cut burn 30% OR start raise. Don't drift.",
  },
  {
    id: "runway_projected",
    label: "Runway (inc. projected)",
    unit: "months",
    amber: 6,
    red: 3,
    direction: "lower_is_worse",
    action: "Same as runway actual — use this as the honest number. Ignores wishful thinking.",
  },
  {
    id: "cash_balance",
    label: "Cash balance",
    unit: "gbp",
    amber: 1500,
    red: 500,
    direction: "lower_is_worse",
    action: "Stop all non-essential spend. Pause SaaS you can. Only Anthropic + Supabase + Tide should flow.",
  },
  {
    id: "monthly_burn_trend",
    label: "Monthly burn trend",
    unit: "gbp",
    amber: 350,
    red: 500,
    direction: "higher_is_worse",
    action: "Full cost audit. Every line item has to justify itself.",
  },
];

/** Evaluate a value against a RedZoneRule, returning its zone. */
export function evaluateRule(value: number | null, rule: RedZoneRule): Zone {
  if (value == null) return "amber";
  const worseThanRed = rule.direction === "lower_is_worse" ? value < rule.red : value > rule.red;
  const worseThanAmber = rule.direction === "lower_is_worse" ? value < rule.amber : value > rule.amber;
  if (worseThanRed) return "red";
  if (worseThanAmber) return "amber";
  return "green";
}

/**
 * Compute the current Stage based on hit milestones. Current stage is the
 * HIGHEST stage where every milestone is hit, plus one (i.e. "you've
 * completed stage N, now working on stage N+1"). If even stage 0 has
 * unhit milestones, current stage is 0.
 */
export function currentStage(
  milestones: { stage: number; is_hit: boolean }[],
): { stage: number; hitInStage: number; totalInStage: number } {
  if (milestones.length === 0) return { stage: 0, hitInStage: 0, totalInStage: 0 };

  // Group by stage, check each stage's completeness from 0 upward.
  const byStage = new Map<number, { hit: number; total: number }>();
  for (const m of milestones) {
    const s = byStage.get(m.stage) ?? { hit: 0, total: 0 };
    s.total += 1;
    if (m.is_hit) s.hit += 1;
    byStage.set(m.stage, s);
  }

  const stages = Array.from(byStage.keys()).sort((a, b) => a - b);
  let current = 0;
  for (const s of stages) {
    const info = byStage.get(s)!;
    if (info.hit === info.total) current = s + 1;
    else {
      current = s;
      break;
    }
  }
  const info = byStage.get(current) ?? { hit: 0, total: 0 };
  return { stage: current, hitInStage: info.hit, totalInStage: info.total };
}
