/**
 * /transactions — paginated list + manual add.
 *
 * Tide CSV upload (the "drag-drop" the spec describes) is deferred — it's
 * a second parser that's moderately involved, and the Excel import already
 * brings over 27 seed transactions via the Tide Txns sheet in Phase 2.5.
 * For now the page lets you read what's there and add manual transactions
 * (e.g. one-off capital injections, corrections).
 */
"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import Nav from "@/components/Nav";
import { fmtGBP } from "@/lib/finance/calculations";

type Txn = {
  id: number;
  txn_date: string;
  description: string;
  counterparty: string | null;
  amount: number;
  category: string | null;
  source: string;
  is_business: boolean;
  is_capital: boolean;
  notes: string | null;
};

const CATEGORIES = ["revenue", "software", "marketing", "bank_fees", "insurance", "legal", "accounting", "capital", "refund", "other"];

export default function TransactionsPage() {
  const [rows, setRows] = useState<Txn[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTxn, setNewTxn] = useState<Partial<Txn>>({
    txn_date: new Date().toISOString().slice(0, 10),
    description: "",
    amount: 0,
    category: "other",
    source: "manual",
    is_business: true,
  });

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const supa = getBrowserSupabase();
    const { data: { user } } = await supa.auth.getUser();
    setEmail(user?.email ?? null);
    const { data } = await supa.schema("finance").from("transactions").select("*").order("txn_date", { ascending: false }).limit(200);
    setRows((data as Txn[]) ?? []);
  }

  async function addTxn() {
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("transactions").insert({
      txn_date: newTxn.txn_date,
      description: newTxn.description,
      counterparty: newTxn.counterparty || null,
      amount: newTxn.amount,
      category: newTxn.category,
      source: "manual",
      is_business: newTxn.is_business ?? true,
      is_capital: (newTxn.category === "capital"),
      notes: newTxn.notes || null,
    });
    if (!error) {
      setShowNew(false);
      setNewTxn({
        txn_date: new Date().toISOString().slice(0, 10),
        description: "",
        amount: 0,
        category: "other",
        source: "manual",
        is_business: true,
      });
      refresh();
    } else {
      alert(`Save failed: ${error.message}`);
    }
  }

  async function deleteTxn(id: number) {
    if (!confirm("Delete this transaction?")) return;
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("transactions").delete().eq("id", id);
    if (!error && rows) setRows(rows.filter((r) => r.id !== id));
  }

  return (
    <>
      <Nav email={email} />
      <main className="max-w-5xl mx-auto p-6 md:p-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Transactions</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {rows ? `${rows.length} records` : "Loading…"}
              <span className="text-zinc-600"> · Tide CSV drag-drop arrives in a follow-up — for now, add manual entries below.</span>
            </p>
          </div>
          <button onClick={() => setShowNew(!showNew)} className="text-xs bg-brand text-brand-fg rounded px-3 py-1.5 font-medium">
            {showNew ? "Cancel" : "+ Add transaction"}
          </button>
        </header>

        {showNew && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 mb-6">
            <h2 className="text-sm font-semibold text-white mb-3">New transaction</h2>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
              <label className="col-span-2">
                <div className="text-zinc-500 mb-1">Date</div>
                <input type="date" value={newTxn.txn_date ?? ""} onChange={(e) => setNewTxn({ ...newTxn, txn_date: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200" />
              </label>
              <label className="col-span-4">
                <div className="text-zinc-500 mb-1">Description</div>
                <input value={newTxn.description ?? ""} onChange={(e) => setNewTxn({ ...newTxn, description: e.target.value })}
                  placeholder="e.g. Reimburse personal expenses"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200" />
              </label>
              <label className="col-span-2">
                <div className="text-zinc-500 mb-1">Counterparty</div>
                <input value={newTxn.counterparty ?? ""} onChange={(e) => setNewTxn({ ...newTxn, counterparty: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200" />
              </label>
              <label className="col-span-2">
                <div className="text-zinc-500 mb-1">Amount (£, +in / -out)</div>
                <input type="number" step="0.01" value={newTxn.amount ?? 0} onChange={(e) => setNewTxn({ ...newTxn, amount: Number(e.target.value) })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200 tabular-nums" />
              </label>
              <label className="col-span-2">
                <div className="text-zinc-500 mb-1">Category</div>
                <select value={newTxn.category ?? "other"} onChange={(e) => setNewTxn({ ...newTxn, category: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="col-span-6">
                <div className="text-zinc-500 mb-1">Notes (optional)</div>
                <input value={newTxn.notes ?? ""} onChange={(e) => setNewTxn({ ...newTxn, notes: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200" />
              </label>
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={addTxn} disabled={!newTxn.description}
                className="text-xs bg-brand text-brand-fg rounded px-4 py-1.5 font-medium disabled:opacity-50">
                Save transaction
              </button>
            </div>
          </section>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Description</th>
                <th className="text-left px-3 py-2">Category</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-left px-3 py-2">Source</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {(rows ?? []).map((t) => (
                <tr key={t.id} className="hover:bg-zinc-900/40">
                  <td className="px-3 py-2 text-zinc-400 tabular-nums text-xs">{t.txn_date.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-zinc-200">
                    {t.description}
                    {t.counterparty && <div className="text-xs text-zinc-500">{t.counterparty}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="text-zinc-400 capitalize">{t.category?.replace(/_/g, " ") ?? "—"}</span>
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${t.amount >= 0 ? "text-emerald-400" : "text-zinc-300"}`}>
                    {fmtGBP(Number(t.amount))}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{t.source}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => deleteTxn(t.id)} className="text-zinc-600 hover:text-red-400 text-xs">×</button>
                  </td>
                </tr>
              ))}
              {rows && rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-zinc-500">
                  No transactions yet. Add one manually or wait for the Tide CSV import.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
