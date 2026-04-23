/**
 * /settings — two sections:
 *   1. Update Tide balance (the Monday ritual; seeds a new cash_snapshot row)
 *   2. Edit assumptions (refund rate, churn, ARPU etc.)
 *
 * Tide-balance update is the most-pressed button in the app, per the spec:
 * §0 says the Monday rhythm is "update Assumptions!B4, glance at Runway".
 * Optimise the form for speed — one big number input + one click.
 */
"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import Nav from "@/components/Nav";
import { fmtGBP } from "@/lib/finance/calculations";

type Assumption = { key: string; value: number; unit: string | null; description: string | null };

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [latestCash, setLatestCash] = useState<{ tide_balance: number; snapshot_date: string } | null>(null);
  const [newBalance, setNewBalance] = useState<string>("");
  const [savingBalance, setSavingBalance] = useState(false);
  const [balanceMsg, setBalanceMsg] = useState<string | null>(null);

  const [assumptions, setAssumptions] = useState<Assumption[] | null>(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const supa = getBrowserSupabase();
    const { data: { user } } = await supa.auth.getUser();
    setEmail(user?.email ?? null);
    const [{ data: cash }, { data: assumps }] = await Promise.all([
      supa.schema("finance").from("cash_snapshots").select("tide_balance, snapshot_date").order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
      supa.schema("finance").from("assumptions").select("*").order("key"),
    ]);
    setLatestCash(cash as { tide_balance: number; snapshot_date: string } | null);
    setAssumptions((assumps as Assumption[]) ?? []);
  }

  async function saveBalance() {
    const n = Number(newBalance);
    if (!isFinite(n) || n < 0) {
      setBalanceMsg("Enter a valid positive number.");
      return;
    }
    setSavingBalance(true);
    setBalanceMsg(null);
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("cash_snapshots").insert({
      tide_balance: n,
      snapshot_date: new Date().toISOString().slice(0, 10),
      source: "manual",
      notes: "Monday update",
    });
    setSavingBalance(false);
    if (error) {
      setBalanceMsg(`Error: ${error.message}`);
    } else {
      setBalanceMsg("Saved.");
      setNewBalance("");
      refresh();
    }
  }

  async function updateAssumption(key: string, value: number) {
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("assumptions").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
    if (!error && assumptions) {
      setAssumptions(assumptions.map((a) => (a.key === key ? { ...a, value } : a)));
    }
  }

  return (
    <>
      <Nav email={email} />
      <main className="max-w-3xl mx-auto p-6 md:p-8 space-y-10">
        <header>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Weekly balance update + assumption editor.</p>
        </header>

        {/* ── Tide balance (the Monday ritual) ─────────────────────────── */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Update Tide balance</h2>
          <p className="text-xs text-zinc-500 mb-4">
            {latestCash
              ? <>Last: {fmtGBP(Number(latestCash.tide_balance))} on {latestCash.snapshot_date}</>
              : "No balance recorded yet."}
          </p>
          <div className="flex gap-2 items-stretch">
            <div className="flex items-center px-3 text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-l text-lg">£</div>
            <input
              type="number"
              step="0.01"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="flex-1 bg-zinc-900 border-y border-zinc-800 text-xl text-white px-3 outline-none tabular-nums"
            />
            <button
              onClick={saveBalance}
              disabled={savingBalance || !newBalance}
              className="bg-brand text-brand-fg font-medium px-5 rounded-r disabled:opacity-50"
            >
              {savingBalance ? "Saving…" : "Save"}
            </button>
          </div>
          {balanceMsg && <p className="text-xs text-zinc-400 mt-2">{balanceMsg}</p>}
          <p className="text-xs text-zinc-600 mt-3">
            Seeds a new <code>cash_snapshots</code> row with today&apos;s date. Old snapshots are kept for the historical chart.
          </p>
        </section>

        {/* ── Assumptions ──────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-white mb-3">Assumptions</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 border-b border-zinc-800">
                <tr>
                  <th className="text-left px-3 py-2">Key</th>
                  <th className="text-right px-3 py-2 w-32">Value</th>
                  <th className="text-left px-3 py-2 w-16">Unit</th>
                  <th className="text-left px-3 py-2">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {(assumptions ?? []).map((a) => (
                  <tr key={a.key} className="hover:bg-zinc-900/40">
                    <td className="px-3 py-2 text-zinc-200">{a.key}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={a.value}
                        onBlur={(e) => { const v = Number(e.target.value); if (v !== a.value) updateAssumption(a.key, v); }}
                        className="bg-transparent text-zinc-100 w-24 text-right outline-none tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-zinc-500 text-xs">{a.unit ?? ""}</td>
                    <td className="px-3 py-2 text-zinc-500 text-xs">{a.description}</td>
                  </tr>
                ))}
                {(!assumptions || assumptions.length === 0) && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-zinc-500">No assumptions yet. Upload the Excel to seed.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
