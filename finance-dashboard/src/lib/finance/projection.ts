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
  // When set, the override (or the projected item's first monthly hit) lands
  // in the month containing this date rather than assuming "next calendar
  // month". Nullable — absent dates keep the old behaviour.
  next_charge_date?: string | null;
};

/**
 * Forward-looking spend allocation — feeds the projection alongside committed
 * cost items. Kept separate so the UI can display "Marketing: £300/£500 spent"
 * against the allowance, while the projection only cares about the cap.
 */
export type BudgetForProjection = {
  id: number;
  category: string;
  name: string;
  monthly_allowance: number;
  starts_on: string;                // ISO date
  ends_on: string | null;           // null = open-ended
  is_active: boolean;
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
  budgets?: BudgetForProjection[];  // new — budget allowances fold into burn
  months?: number;                  // default 12
  monthlyRevenue?: number;          // default 0 until Phase 5
  includeProjected?: boolean;       // default true — use the "worst case" line
  // Target horizon for the "1-year cover" KPI. Defaults to 12 months — the
  // number of months we want runway to cover, not just survive. The maths
  // use `months` for the chart x-axis and `coverHorizon` separately for the
  // cover-met flag.
  coverHorizon?: number;            // default 12
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

/** Compare two ISO-date first-of-month strings. */
function sameMonthIso(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Which month (relative to today) does an ISO date land in? -1 if past. */
function monthsFromNow(iso: string | null | undefined, today: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear() - today.getFullYear();
  const m = d.getMonth() - today.getMonth();
  return y * 12 + m;
}

export function project({
  cash,
  costs,
  budgets = [],
  months = 12,
  monthlyRevenue = 0,
  includeProjected = true,
}: ProjectionInput): ProjectionPoint[] {
  const activeCosts = costs.filter(
    (c) => c.is_active && (includeProjected ? true : !c.is_projected),
  );

  // Steady-state burn — items without a specific charge date apply every
  // month. Items WITH a next_charge_date are pulled out of steady so they
  // only land in the specific month, not every month.
  const dateAnchored = activeCosts.filter((c) => !!c.next_charge_date);
  const steadyCosts  = activeCosts.filter((c) => !c.next_charge_date);
  const steadyBurn   = steadyCosts.reduce((s, c) => s + c.monthly_amount, 0);

  const today = firstOfMonth(new Date());
  const activeBudgets = budgets.filter((b) => b.is_active);

  const points: ProjectionPoint[] = [];
  let balance = cash;

  for (let i = 0; i <= months; i++) {
    const d = addMonths(today, i);
    const monthIso = isoDate(d);
    const events: ProjectionEvent[] = [];

    // Month 0 is "today — balance only, no burn applied yet".
    let burn = i === 0 ? 0 : steadyBurn;
    if (i > 0) {
      // (a) date-anchored cost items — override for the month they fall in.
      for (const c of dateAnchored) {
        const targetMonth = monthsFromNow(c.next_charge_date!, today);
        if (targetMonth === i) {
          burn += c.next_month_override ?? c.monthly_amount;
        }
      }
      // (b) generic "next_month_override" with no date → legacy path, lands
      // in month 1. Preserves old behaviour for items the user hasn't dated.
      if (i === 1) {
        for (const c of steadyCosts) {
          if (c.next_month_override != null) {
            burn += c.next_month_override - c.monthly_amount;
          }
        }
      }
      // (c) budgets — each active budget contributes its monthly_allowance
      // during the window [starts_on, ends_on]. Budgets with no ends_on apply
      // for the whole 12-month projection.
      for (const b of activeBudgets) {
        const starts = new Date(b.starts_on);
        const ends = b.ends_on ? new Date(b.ends_on) : null;
        if (d >= firstOfMonth(starts) && (!ends || d <= firstOfMonth(ends))) {
          burn += Number(b.monthly_allowance) || 0;
        }
      }
    }

    const point: ProjectionPoint = {
      month: i,
      date: monthIso,
      label: fmtMonthLabel(d),
      balance,
      burn,
      events,
    };
    points.push(point);

    balance = balance - burn + (i === 0 ? 0 : monthlyRevenue);
    if (balance < 0) balance = 0;
  }

  // Event annotations ───────────────────────────────────────────────────────
  // (a) Runway depletion — first month where balance hits zero.
  const depleteIdx = points.findIndex((p, idx) => idx > 0 && p.balance <= 0);
  if (depleteIdx > 0) {
    points[depleteIdx].events.push({
      kind: "runway_depleted",
      label: "Runway runs out",
      detail: "At current burn, cash hits zero here.",
    });
  }

  // (b) Override markers — any month where a dated charge lands.
  for (const c of dateAnchored) {
    const targetMonth = monthsFromNow(c.next_charge_date!, today);
    if (targetMonth != null && targetMonth > 0 && targetMonth <= months) {
      const override = c.next_month_override;
      if (override != null && override !== c.monthly_amount) {
        points[targetMonth].events.push({
          kind: "override",
          label: override > c.monthly_amount ? "Higher-than-usual charge" : "Lower-than-usual charge",
          detail: `${c.name} — ${sameMonthIso(points[targetMonth].date, c.next_charge_date!) ? "charge due" : "expected"}`,
        });
      } else if (c.is_projected) {
        points[targetMonth].events.push({
          kind: "override",
          label: "Projected charge",
          detail: c.name,
        });
      }
    }
  }
  // Undated legacy overrides still mark month 1.
  const legacyDiff = steadyCosts.reduce(
    (s, c) => s + (c.next_month_override != null ? c.next_month_override - c.monthly_amount : 0),
    0,
  );
  if (points.length > 1 && legacyDiff !== 0) {
    const names = steadyCosts
      .filter((c) => c.next_month_override != null)
      .map((c) => c.name);
    if (names.length) {
      points[1].events.push({
        kind: "override",
        label: legacyDiff > 0 ? "Higher-than-usual charges" : "Lower-than-usual charges",
        detail: names.join(", "),
      });
    }
  }

  return points;
}

/**
 * 12-month-cover KPI — answers "will we be alive in 12 months at the current
 * trajectory?" Returns whether we're covered, the month we'd run out (if
 * ever within the horizon), and how much cash we'd need today to cover the
 * full 12 months from the current balance + committed costs + budgets.
 *
 * Computed from a projection series so it's always consistent with the
 * chart — don't re-derive from raw costs/budgets here.
 */
export function coverSummary(points: ProjectionPoint[], horizon = 12) {
  const window = points.slice(0, horizon + 1);        // +1 because points[0] is "today"
  const depleteIdx = window.findIndex((p, i) => i > 0 && p.balance <= 0);
  const covered = depleteIdx === -1;
  // Total forward burn minus any revenue already baked into balance deltas.
  // The chart already clamped balance at zero, so the shortfall = the cash
  // we'd have needed to stay above £0 — approximated from the last positive
  // balance + remaining burn.
  const totalBurn = window.slice(1).reduce((s, p) => s + p.burn, 0);
  const startingCash = points[0]?.balance ?? 0;
  const shortfall = Math.max(0, totalBurn - startingCash);
  return {
    covered,
    horizonMonths: horizon,
    depleteMonth: depleteIdx > 0 ? depleteIdx : null,
    depleteLabel: depleteIdx > 0 ? window[depleteIdx].label : null,
    totalBurn,
    startingCash,
    shortfall,
  };
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
