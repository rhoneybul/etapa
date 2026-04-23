"use client";

/**
 * Budgets — forward-looking spend allocations per category.
 *
 * Distinct from /costs:
 *   - cost_items = committed recurring expenses (already happening each month)
 *   - budgets    = allocation caps for a category over a period (intent)
 *
 * Budgets fold into the 12-month cash projection so the runway maths
 * anticipate planned marketing / legal / finance spend even before a
 * transaction hits Tide. "Spent this month" pulls from finance.transactions
 * by category match, so the bar reflects reality as it unfolds.
 *
 * No Excel involvement — everything here lives in finance.budgets and is
 * edited in place like the costs table.
 */

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { fmtGBP } from "@/lib/finance/calculations";

type Budget = {
  id: number;
  category: string;
  name: string;
  monthly_allowance: number;
  starts_on: string;
  ends_on: string | null;
  notes: string | null;
  is_active: boolean;
  display_order: number | null;
};

type Spent = { category: string; spent_this_month: number };

const CATEGORIES = ["marketing", "legal", "finance", "software", "insurance", "other"];

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[] | null>(null);
  const [spend, setSpend] = useState<Record<string, number>>({});
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const supa = getBrowserSupabase();
    const { data: { user } } = await supa.auth.getUser();
    setEmail(user?.email ?? null);

    const { data } = await supa
      .schema("finance")
      .from("budgets")
      .select("*")
      .order("display_order", { ascending: true })
      .order("category", { ascending: true });
    setBudgets((data as Budget[]) ?? []);

    // Sum current-month transactions per category. Negative amounts = outflow,
    // so we take abs() on the sum for display.
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const { data: txs } = await supa
      .schema("finance")
      .from("transactions")
      .select("category, amount")
      .gte("txn_date", startOfMonth.toISOString())
      .lt("amount", 0); // outflows only
    const byCat: Record<string, number> = {};
    (txs as Spent[] | null)?.forEach?.(() => { /* unused, keeping type safe */ });
    (txs as { category: string | null; amount: number }[] | null)?.forEach((t) => {
      if (!t.category) return;
      byCat[t.category] = (byCat[t.category] ?? 0) + Math.abs(Number(t.amount) || 0);
    });
    setSpend(byCat);
  }

  async function updateBudget(id: number, patch: Partial<Budget>) {
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("budgets").update(patch).eq("id", id);
    if (!error && budgets) setBudgets(budgets.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function deleteBudget(id: number) {
    if (!confirm("Delete this budget?")) return;
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("budgets").delete().eq("id", id);
    if (!error && budgets) setBudgets(budgets.filter((b) => b.id !== id));
  }

  async function addBudget() {
    const supa = getBrowserSupabase();
    const { data, error } = await supa
      .schema("finance")
      .from("budgets")
      .insert({
        name: "New budget",
        category: "other",
        monthly_allowance: 0,
        is_active: true,
        starts_on: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();
    if (!error && data && budgets) setBudgets([...budgets, data as Budget]);
  }

  const active = (budgets ?? []).filter((b) => b.is_active);
  const monthlyTotal = active.reduce((s, b) => s + Number(b.monthly_allowance || 0), 0);
  const annualTotal = monthlyTotal * 12;

  return (
    <>
      <Nav email={email} />
      <main className="max-w-5xl mx-auto p-6 md:p-8 space-y-6">
        <header>
          <h1 className="text-xl font-semibold">Budgets</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Planned spend by category. Folds into the 12-month cash projection.
            Totals: <strong className="text-white">{fmtGBP(monthlyTotal)}/mo</strong>{" "}
            <span className="text-zinc-600">({fmtGBP(annualTotal)}/yr)</span>
          </p>
        </header>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">All budgets</h2>
            <button onClick={addBudget} className="text-xs text-brand hover:opacity-80">+ Add budget</button>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 border-b border-zinc-800">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Category</th>
                  <th className="text-right px-3 py-2 font-medium">£/mo</th>
                  <th className="text-left px-3 py-2 font-medium">Spent this month</th>
                  <th className="text-left px-3 py-2 font-medium">Window</th>
                  <th className="text-left px-3 py-2 font-medium">Notes</th>
                  <th className="text-center px-3 py-2 font-medium">Active</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {(budgets ?? []).map((b) => (
                  <BudgetRow
                    key={b.id}
                    b={b}
                    spent={spend[b.category] ?? 0}
                    onUpdate={updateBudget}
                    onDelete={deleteBudget}
                  />
                ))}
                {budgets && budgets.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-center text-xs text-zinc-500">
                      No budgets yet. Click &quot;+ Add budget&quot; to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

function BudgetRow({
  b, spent, onUpdate, onDelete,
}: {
  b: Budget;
  spent: number;
  onUpdate: (id: number, patch: Partial<Budget>) => void;
  onDelete: (id: number) => void;
}) {
  const allowance = Number(b.monthly_allowance) || 0;
  const pct = allowance > 0 ? Math.min(100, (spent / allowance) * 100) : 0;
  // Colour tiers — the rule of thumb is 80% amber, 100% red. Keeps matches the
  // red-zone language used elsewhere in the dashboard.
  const barColor = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <tr className="hover:bg-zinc-900/40">
      <td className="px-3 py-2">
        <input
          defaultValue={b.name}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== b.name) onUpdate(b.id, { name: v });
          }}
          className="bg-transparent text-zinc-100 w-full outline-none"
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={b.category}
          onChange={(e) => onUpdate(b.id, { category: e.target.value })}
          className="bg-transparent text-zinc-300 outline-none"
        >
          {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          step="0.01"
          defaultValue={b.monthly_allowance}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v !== b.monthly_allowance) onUpdate(b.id, { monthly_allowance: v });
          }}
          className="bg-transparent text-zinc-100 w-20 text-right outline-none tabular-nums"
        />
      </td>
      <td className="px-3 py-2 w-56">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-zinc-900 rounded overflow-hidden">
            <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs tabular-nums text-zinc-400">
            {fmtGBP(spent)} / {fmtGBP(allowance)}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-zinc-400">
        <div className="flex items-center gap-1">
          <input
            type="date"
            defaultValue={b.starts_on}
            onBlur={(e) => {
              const v = e.target.value;
              if (v && v !== b.starts_on) onUpdate(b.id, { starts_on: v });
            }}
            className="bg-transparent outline-none"
          />
          <span className="text-zinc-600">→</span>
          <input
            type="date"
            defaultValue={b.ends_on ?? ""}
            onBlur={(e) => {
              const v = e.target.value || null;
              if (v !== b.ends_on) onUpdate(b.id, { ends_on: v });
            }}
            placeholder="open-ended"
            className="bg-transparent outline-none"
          />
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          defaultValue={b.notes ?? ""}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (b.notes ?? "")) onUpdate(b.id, { notes: v || null });
          }}
          className="bg-transparent text-zinc-400 w-full outline-none text-xs"
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={b.is_active}
          onChange={(e) => onUpdate(b.id, { is_active: e.target.checked })}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button onClick={() => onDelete(b.id)} className="text-zinc-600 hover:text-red-400 text-xs">×</button>
      </td>
    </tr>
  );
}
