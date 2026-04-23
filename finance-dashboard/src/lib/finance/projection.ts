/**
 * Forward cash projection — pure maths, no I/O.
 *
 * Takes the current cash balance + the active cost items, returns one point
 * per month for the next N months. Each point carries:
 *   - a `date` (first of each month)
 *   - the projected `balance` at the start of that month
 *   - the `burn` applied that month (monthly_amount per item, OR
 *     next_month_override for the item's first projected month if set)
 *   - any event markers (runway depletion, override month)
 *
 * Revenue side stays at zero until Phase 5 wires up RevenueCat. When it
 * lands, pass in a monthly revenue array and the projection adds it per
 * month.
 */

export type CostItemForProjection = {
  name: string;
  monthly_amount: number;
  is_active: boolean;
  is_projected: boolean;
  next_month_override: number | null;
  override_note: string | null;
};

export type ProjectionPoint = {
  month: number;                    // 0 = current month, 1 = next, ...
  date: string;                     // ISO YYYY-MM-DD, first of the month
  label: string;                    // e.g. "May 26" for the chart axis
  balance: number;                  // cash at the START of this month
  burn: number;                     // burn applied during this month
  events: ProjectionEvent[];
};

export type ProjectionEvent = {
  kind: "override" | "runway_depleted";
  label: string;
  detail?: string;
};

export type ProjectionInput = {
  cash: number;                     // current balance in GBP
  costs: CostItemForProjection[];
  months?: number;                  // default 12
  monthlyRevenue?: number;          // default 0 until Phase 5
  includeProjected?: boolean;       // default true — use the "worst case" line
};

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function fmtMonthLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export function project({
  cash,
  costs,
  months = 12,
  monthlyRevenue = 0,
  includeProjected = true,
}: ProjectionInput): ProjectionPoint[] {
  const activeCosts = costs.filter(
    (c) => c.is_active && (includeProjected ? true : !c.is_projected),
  );

  // Steady-state burn — used for every month EXCEPT the one where an
  // override is applied (only month 1 carries the override because it's
  // the "next charge" expectation).
  const steadyBurn = activeCosts.reduce((s, c) => s + c.monthly_amount, 0);

  // Month-1 burn applies any set overrides; rest of months use steady.
  const overriddenBurn = activeCosts.reduce((s, c) => {
    return s + (c.next_month_override ?? c.monthly_amount);
  }, 0);

  const today = firstOfMonth(new Date());
  const points: ProjectionPoint[] = [];
  let balance = cash;

  for (let i = 0; i <= months; i++) {
    const d = addMonths(today, i);
    const events: ProjectionEvent[] = [];
    const burn = i === 1 ? overriddenBurn : i === 0 ? 0 : steadyBurn;
    // month 0 = "this month, start of" — no burn applied yet.
    // month 1 onwards — burn accumulates.

    const point: ProjectionPoint = {
      month: i,
      date: isoDate(d),
      label: fmtMonthLabel(d),
      balance,
      burn,
      events,
    };
    points.push(point);

    balance -= burn;
    // clamp at zero for the chart — negative doesn't mean anything real
    // (you'd have run out already).
    if (balance < 0) balance = 0;
  }

  // Second pass — attach event annotations.
  // (a) runway depletion: the first month where balance drops to / below 0.
  const depleteIdx = points.findIndex((p) => p.balance <= 0);
  if (depleteIdx > 0) {
    points[depleteIdx].events.push({
      kind: "runway_depleted",
      label: "Runway runs out",
      detail: "At current burn, cash hits zero here.",
    });
  }

  // (b) overrides: mark month 1 if any overrides are active.
  if (points.length > 1 && overriddenBurn !== steadyBurn) {
    const diff = overriddenBurn - steadyBurn;
    const overrides = activeCosts
      .filter((c) => c.next_month_override != null && c.next_month_override !== c.monthly_amount)
      .map((c) => c.name);
    if (overrides.length) {
      points[1].events.push({
        kind: "override",
        label: diff > 0 ? "Higher-than-usual charges" : "Lower-than-usual charges",
        detail: overrides.join(", "),
      });
    }
  }

  return points;
}

/**
 * Summary numbers for the KPI strip — derived from the same costs array
 * used by the projection so everything stays consistent.
 */
export function burnSummary(costs: CostItemForProjection[]) {
  const active = costs.filter((c) => c.is_active && !c.is_projected);
  const projectedExtras = costs.filter((c) => c.is_active && c.is_projected);
  const steady = active.reduce((s, c) => s + c.monthly_amount, 0);
  const withProjected = steady + projectedExtras.reduce((s, c) => s + c.monthly_amount, 0);
  const expectedNext = active.reduce(
    (s, c) => s + (c.next_month_override ?? c.monthly_amount),
    0,
  );
  const overridesActive = active.filter((c) => c.next_month_override != null).length;
  const variance = expectedNext - steady;
  const variancePct = steady > 0 ? (variance / steady) * 100 : 0;
  return {
    steady,
    withProjected,
    expectedNext,
    variance,
    variancePct,
    overridesActive,
  };
}
