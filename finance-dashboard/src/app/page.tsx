/**
 * Home dashboard — the single most important page.
 *
 * Reads every number server-side so the initial paint is fast and there's
 * no loading spinner flash. Everything is a read from finance.* tables
 * (cost_items, cash_snapshots, todos, milestones), gated by RLS so the
 * same query would return nothing for a non-allowlisted user.
 *
 * Layout per spec §10:
 *   - KPI strip: Cash, MRR, Runway, Paying users
 *   - Red zone banner (only if any rule is red/amber)
 *   - Current stage + next milestone
 *   - Top open todos (feeds TodoSummary)
 *   - Burn breakdown by category
 *
 * Historical cash-projection chart ships in Phase 7 once the daily cron
 * has populated metric_history. Until then, the chart slot shows an
 * empty-state card.
 */
import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import CashFlowChart from "@/components/CashFlowChart";
import {
  fmtGBP,
  fmtMonths,
  fmtPctDelta,
  runwayZone,
  RED_ZONE_RULES,
  evaluateRule,
  currentStage,
  type Zone,
} from "@/lib/finance/calculations";
import { project, burnSummary, type CostItemForProjection } from "@/lib/finance/projection";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  // ── Parallel reads ─────────────────────────────────────────────────────
  // Kick off every query at once; we're dashboarding, not doing a
  // sequential workflow. Individual errors fall through as null/empty so
  // the page can still render a useful partial view.
  const [
    { count: importCount },
    { data: cash },
    { data: costs },
    { data: todos },
    { data: milestones },
  ] = await Promise.all([
    supabase.schema("finance").from("imports").select("*", { head: true, count: "exact" }),
    supabase.schema("finance").from("cash_snapshots").select("tide_balance, snapshot_date, notes").order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.schema("finance").from("cost_items").select("name, category, monthly_amount, is_projected, is_active, next_month_override, override_note").order("monthly_amount", { ascending: false }),
    supabase.schema("finance").from("todos").select("id, priority, category, title, context, status, display_order").order("display_order", { ascending: true, nullsFirst: false }),
    supabase.schema("finance").from("milestones").select("id, stage, stage_name, name, target_text, is_hit, display_order").order("display_order"),
  ]);

  const seeded = (importCount ?? 0) > 0;

  if (!seeded) {
    return (
      <>
        <Nav email={user?.email} />
        <main className="max-w-3xl mx-auto p-6 md:p-10">
          <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-6">
            <h2 className="text-base font-semibold text-amber-300 mb-2">Set up the dashboard</h2>
            <p className="text-sm text-zinc-300 mb-4">
              The database is empty. Upload your <code>Etapa_Financial_Model.xlsx</code> on the import page to seed everything.
            </p>
            <Link href="/import" className="inline-block bg-brand text-brand-fg text-sm font-medium rounded-lg px-4 py-2 hover:opacity-90">
              Upload Excel →
            </Link>
          </div>
        </main>
      </>
    );
  }

  // ── Derived numbers ────────────────────────────────────────────────────
  // Normalise the costs array into the shape the projection lib expects,
  // coercing numeric fields that Supabase returns as strings for NUMERIC
  // columns into actual JS numbers.
  const costsForProj: CostItemForProjection[] = (costs ?? []).map((c) => ({
    name: c.name,
    monthly_amount: Number(c.monthly_amount ?? 0),
    is_active: !!c.is_active,
    is_projected: !!c.is_projected,
    next_month_override: c.next_month_override != null ? Number(c.next_month_override) : null,
    override_note: c.override_note ?? null,
  }));
  const summary = burnSummary(costsForProj);
  const burnActual = summary.steady;
  const burnProjected = summary.withProjected;
  const cashBalance = cash?.tide_balance != null ? Number(cash.tide_balance) : null;
  const runwayActual = cashBalance != null && burnActual > 0 ? cashBalance / burnActual : null;
  const runwayProjected = cashBalance != null && burnProjected > 0 ? cashBalance / burnProjected : null;
  const zone = runwayZone(runwayActual);

  // Forward projection — feeds the CashFlowChart. 12 months is the spec.
  const projection = cashBalance != null
    ? project({ cash: cashBalance, costs: costsForProj, months: 12 })
    : [];

  // Variance zone for the "expected next month" KPI. If next-month expected
  // burn is >15% above steady-state, flag amber; >30% → red. Thresholds
  // match typical SaaS-budget variance tolerances.
  const varianceZone: Zone =
    summary.overridesActive === 0 ? "green"
    : Math.abs(summary.variancePct) > 30 ? "red"
    : Math.abs(summary.variancePct) > 15 ? "amber"
    : "green";

  // MRR + paying users land in Phase 5 (RevenueCat webhook).
  const mrr = 0;
  const payingUsers = 0;

  const openTodos = (todos ?? []).filter((t) => t.status === "todo" || t.status === "in_progress");
  const stageInfo = currentStage((milestones ?? []).map((m) => ({ stage: m.stage, is_hit: m.is_hit })));
  const nextMilestone = (milestones ?? []).find((m) => m.stage === stageInfo.stage && !m.is_hit) ?? null;

  // Burn-by-category breakdown for the right-hand tile. Uses the raw
  // DB-shaped costs array because the projection type doesn't carry
  // category (it's irrelevant to the math).
  const burnByCategory = new Map<string, number>();
  for (const c of (costs ?? [])) {
    if (!c.is_active || c.is_projected) continue;
    const cat = c.category ?? "other";
    burnByCategory.set(cat, (burnByCategory.get(cat) ?? 0) + Number(c.monthly_amount || 0));
  }
  const burnRows = Array.from(burnByCategory.entries()).sort((a, b) => b[1] - a[1]);

  // Active red zones — only render the banner when something's amber or red.
  const redZoneValues: Record<string, number | null> = {
    runway_actual: runwayActual,
    runway_projected: runwayProjected,
    cash_balance: cashBalance,
    monthly_burn_trend: burnActual,
  };
  const activeZones = RED_ZONE_RULES
    .map((rule) => ({ rule, zone: evaluateRule(redZoneValues[rule.id] ?? null, rule), value: redZoneValues[rule.id] }))
    .filter((z) => z.zone !== "green");

  return (
    <>
      <Nav email={user?.email} />
      <main className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
        {/* ── Red zone banner ─────────────────────────────────────────── */}
        {activeZones.length > 0 && <RedZoneBanner zones={activeZones} />}

        {/* ── KPI strip ───────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Cash" value={fmtGBP(cashBalance)} sub={cash?.snapshot_date ? `as of ${cash.snapshot_date}` : ""} />
          <KpiCard label="MRR" value={fmtGBP(mrr)} sub="Phase 5: RevenueCat" />
          <KpiCard label="Runway" value={fmtMonths(runwayActual)} sub={`${fmtMonths(runwayProjected)} inc. projected`} zone={zone} />
          <KpiCard
            label="Expected next month"
            value={fmtGBP(summary.expectedNext)}
            sub={summary.overridesActive > 0
              ? `${fmtPctDelta(summary.variancePct)} vs ${fmtGBP(summary.steady)} · ${summary.overridesActive} flagged`
              : `matches steady-state ${fmtGBP(summary.steady)}`}
            zone={varianceZone}
          />
          <KpiCard label="Paying users" value={payingUsers.toString()} sub="Phase 5: RevenueCat" />
        </section>

        {/* ── Cash projection chart ─────────────────────────────────────── */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Cash projection (12 months)</h3>
              <p className="text-xs text-zinc-500 mt-1">
                At current active burn of {fmtGBP(burnActual)}/mo, with zero revenue assumed.
                {summary.overridesActive > 0 && " Next-month marker shows the effect of your flagged items."}
              </p>
            </div>
          </div>
          {cashBalance == null ? (
            <p className="text-sm text-zinc-500">Upload the Excel or set a Tide balance in Settings to project.</p>
          ) : (
            <CashFlowChart points={projection} />
          )}
        </section>

        {/* ── Stage + next milestone ──────────────────────────────────── */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm">
          <div className="flex items-center gap-2 text-zinc-300">
            <span className="text-zinc-500">You&apos;re in</span>
            <strong className="text-white">Stage {stageInfo.stage}</strong>
            <span className="text-zinc-500">· {stageInfo.hitInStage}/{stageInfo.totalInStage} milestones hit</span>
          </div>
          {nextMilestone && (
            <div className="mt-1 text-zinc-400">
              Next: <span className="text-zinc-200">{nextMilestone.name}</span>
              <span className="text-zinc-500"> — {nextMilestone.target_text}</span>
            </div>
          )}
          <Link href="/milestones" className="text-xs text-brand hover:opacity-80 mt-2 inline-block">See all milestones →</Link>
        </section>

        {/* ── Todos + burn side-by-side ────────────────────────────────── */}
        <section className="grid md:grid-cols-2 gap-4">
          {/* Top todos */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Active todos</h3>
              <span className="text-xs text-zinc-500">{openTodos.length} open</span>
            </div>
            {openTodos.length === 0 ? (
              <p className="text-xs text-zinc-500">Nothing outstanding. Nice.</p>
            ) : (
              <ul className="space-y-2">
                {openTodos.slice(0, 10).map((t) => (
                  <li key={t.id} className="flex gap-2 text-xs">
                    <span className="text-zinc-500 shrink-0 w-4">{t.priority}</span>
                    <div className="min-w-0">
                      <div className="text-zinc-200 truncate">{t.title}</div>
                      {t.context && <div className="text-zinc-500 truncate">{t.context}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/todos" className="text-xs text-brand hover:opacity-80 mt-3 inline-block">Full todo list →</Link>
          </div>

          {/* Burn breakdown */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Monthly burn by category</h3>
              <span className="text-xs text-zinc-500">{fmtGBP(burnActual)} active</span>
            </div>
            {burnRows.length === 0 ? (
              <p className="text-xs text-zinc-500">No cost items yet.</p>
            ) : (
              <ul className="space-y-2">
                {burnRows.map(([cat, amt]) => {
                  const pct = burnActual > 0 ? (amt / burnActual) * 100 : 0;
                  return (
                    <li key={cat} className="text-xs">
                      <div className="flex justify-between text-zinc-300 mb-1">
                        <span className="capitalize">{cat.replace(/_/g, " ")}</span>
                        <span className="text-zinc-400">{fmtGBP(amt)}</span>
                      </div>
                      <div className="h-1 bg-zinc-800 rounded">
                        <div className="h-full bg-brand rounded" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="text-xs text-zinc-500 mt-3 pt-3 border-t border-zinc-800">
              {fmtGBP(burnProjected)} including projected · <Link href="/costs" className="text-brand hover:opacity-80">Edit costs →</Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, zone }: { label: string; value: string; sub?: string; zone?: Zone }) {
  const zoneColour = zone === "red" ? "text-zone-red" : zone === "amber" ? "text-zone-amber" : zone === "green" ? "text-zone-green" : "text-white";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums ${zoneColour}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

type ActiveZone = { rule: typeof RED_ZONE_RULES[number]; zone: Zone; value: number | null | undefined };
function RedZoneBanner({ zones }: { zones: ActiveZone[] }) {
  const worst = zones.some((z) => z.zone === "red") ? "red" : "amber";
  const border = worst === "red" ? "border-red-900/50 bg-red-950/30" : "border-amber-900/50 bg-amber-950/30";
  const text = worst === "red" ? "text-red-300" : "text-amber-300";
  return (
    <section className={`rounded-xl border p-4 ${border}`}>
      <h3 className={`text-sm font-semibold ${text} mb-2`}>
        {worst === "red" ? "🔴 Red zone — act now" : "🟠 Amber zone — watch closely"}
      </h3>
      <ul className="text-xs text-zinc-300 space-y-2">
        {zones.map(({ rule, zone, value }) => (
          <li key={rule.id}>
            <div className="flex justify-between">
              <span className="font-medium">{rule.label}</span>
              <span className={zone === "red" ? "text-red-300" : "text-amber-300"}>
                {rule.unit === "months"
                  ? fmtMonths(value as number | null)
                  : rule.unit === "gbp"
                  ? fmtGBP(value as number | null)
                  : `${value}`}
              </span>
            </div>
            <div className="text-zinc-400 mt-0.5">{rule.action}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
