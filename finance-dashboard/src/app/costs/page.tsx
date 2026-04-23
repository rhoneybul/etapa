/**
 * /costs — the Cost Items editor.
 *
 * Two tables side-by-side: Active and Projected. Every row is editable
 * inline (blur-to-save), with an "add" row at the bottom of each table
 * and a delete button per row. Every edit writes directly to
 * finance.cost_items via RLS.
 *
 * Re-uploading the Excel blows this away (delete + insert per table), so
 * edits made here are transient unless you also update the Excel. The
 * monthly rhythm is: tweak in dashboard during the week, update the
 * Excel once a month to keep them in sync.
 */
"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import Nav from "@/components/Nav";
import { fmtGBP } from "@/lib/finance/calculations";

type Cost = {
  id: number;
  name: string;
  category: string;
  monthly_amount: number;
  is_active: boolean;
  is_projected: boolean;
  cadence: string;
  notes: string | null;
  card_on_file: string | null;
};

const CATEGORIES = ["software", "marketing", "legal", "accounting", "insurance", "bank_fees", "other"];

export default function CostsPage() {
  const [costs, setCosts] = useState<Cost[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const supa = getBrowserSupabase();
    const { data: { user } } = await supa.auth.getUser();
    setEmail(user?.email ?? null);
    const { data } = await supa.schema("finance").from("cost_items").select("*").order("is_projected").order("monthly_amount", { ascending: false });
    setCosts((data as Cost[]) ?? []);
  }

  async function updateCost(id: number, patch: Partial<Cost>) {
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("cost_items").update(patch).eq("id", id);
    if (!error && costs) setCosts(costs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function deleteCost(id: number) {
    if (!confirm("Delete this cost item?")) return;
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("cost_items").delete().eq("id", id);
    if (!error && costs) setCosts(costs.filter((c) => c.id !== id));
  }

  async function addCost(isProjected: boolean) {
    const supa = getBrowserSupabase();
    const { data, error } = await supa.schema("finance").from("cost_items").insert({
      name: "New item",
      category: "other",
      monthly_amount: 0,
      is_active: true,
      is_projected: isProjected,
      cadence: "monthly",
    }).select().single();
    if (!error && data && costs) setCosts([...costs, data as Cost]);
  }

  const actual = (costs ?? []).filter((c) => !c.is_projected);
  const projected = (costs ?? []).filter((c) => c.is_projected);
  const actualSum = actual.filter((c) => c.is_active).reduce((s, c) => s + Number(c.monthly_amount || 0), 0);
  const projectedSum = projected.filter((c) => c.is_active).reduce((s, c) => s + Number(c.monthly_amount || 0), 0);

  return (
    <>
      <Nav email={email} />
      <main className="max-w-5xl mx-auto p-6 md:p-8 space-y-10">
        <header>
          <h1 className="text-xl font-semibold">Cost items</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Active burn: <strong className="text-white">{fmtGBP(actualSum)}</strong>
            <span className="text-zinc-600"> · +{fmtGBP(projectedSum)} projected</span>
          </p>
        </header>

        <Table title="Active monthly costs" items={actual} onUpdate={updateCost} onDelete={deleteCost} onAdd={() => addCost(false)} />
        <Table title="Projected / contingency" items={projected} onUpdate={updateCost} onDelete={deleteCost} onAdd={() => addCost(true)} />
      </main>
    </>
  );
}

function Table({
  title, items, onUpdate, onDelete, onAdd,
}: {
  title: string;
  items: Cost[];
  onUpdate: (id: number, patch: Partial<Cost>) => void;
  onDelete: (id: number) => void;
  onAdd: () => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <button onClick={onAdd} className="text-xs text-brand hover:opacity-80">+ Add item</button>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-zinc-500 border-b border-zinc-800">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Category</th>
              <th className="text-right px-3 py-2 font-medium">£/mo</th>
              <th className="text-left px-3 py-2 font-medium">Notes</th>
              <th className="text-center px-3 py-2 font-medium">Active</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {items.map((c) => (
              <tr key={c.id} className="hover:bg-zinc-900/40">
                <td className="px-3 py-2">
                  <input
                    defaultValue={c.name}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) onUpdate(c.id, { name: v }); }}
                    className="bg-transparent text-zinc-100 w-full outline-none"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={c.category}
                    onChange={(e) => onUpdate(c.id, { category: e.target.value })}
                    className="bg-transparent text-zinc-300 outline-none"
                  >
                    {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={c.monthly_amount}
                    onBlur={(e) => { const v = Number(e.target.value); if (v !== c.monthly_amount) onUpdate(c.id, { monthly_amount: v }); }}
                    className="bg-transparent text-zinc-100 w-20 text-right outline-none tabular-nums"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={c.notes ?? ""}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.notes ?? "")) onUpdate(c.id, { notes: v || null }); }}
                    className="bg-transparent text-zinc-400 w-full outline-none text-xs"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={c.is_active}
                    onChange={(e) => onUpdate(c.id, { is_active: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => onDelete(c.id)} className="text-zinc-600 hover:text-red-400 text-xs">×</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-xs text-zinc-500">No items yet. Click &quot;+ Add item&quot;.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
