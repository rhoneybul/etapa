"use client";

/**
 * Quick actions strip — shown at the top of the home dashboard so keeping
 * state fresh is a 10-second job, no Excel required.
 *
 * Two actions:
 *   1. "+ Log payment"    — writes a finance.transactions row in place.
 *   2. "Update balance"   — writes a new finance.cash_snapshots row with
 *                           today's date and the balance you just typed.
 *
 * Both hit the DB directly via the browser Supabase client (RLS-gated).
 * No API route needed — the schema policies already cover this.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const CATEGORIES = [
  "software", "marketing", "legal", "accounting", "insurance",
  "bank_fees", "capital", "revenue", "refund", "other",
];

export default function QuickActions() {
  const router = useRouter();
  const [openPayment, setOpenPayment] = useState(false);
  const [openBalance, setOpenBalance] = useState(false);

  async function logPayment(payload: {
    amount: number;
    category: string;
    description: string;
    txnDate: string;
  }) {
    const supa = getBrowserSupabase();
    // Amount sign — outflows are negative, matching how bank CSVs typically
    // represent debits. The UI accepts a positive amount and a category; a
    // "revenue" or "capital" category flips the sign automatically so we
    // never double-negate.
    const isInflow = payload.category === "revenue" || payload.category === "capital" || payload.category === "refund";
    const signed = isInflow ? Math.abs(payload.amount) : -Math.abs(payload.amount);
    const { error } = await supa.schema("finance").from("transactions").insert({
      txn_date: new Date(payload.txnDate).toISOString(),
      source: "manual",
      description: payload.description,
      amount: signed,
      currency: "GBP",
      category: payload.category,
      is_business: true,
    });
    if (error) {
      alert(`Failed to log payment: ${error.message}`);
      return;
    }
    setOpenPayment(false);
    router.refresh();
  }

  async function updateBalance(payload: { balance: number; note: string }) {
    const supa = getBrowserSupabase();
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supa.schema("finance").from("cash_snapshots").insert({
      snapshot_date: today,
      tide_balance: payload.balance,
      source: "manual",
      notes: payload.note || null,
    });
    if (error) {
      alert(`Failed to update balance: ${error.message}`);
      return;
    }
    setOpenBalance(false);
    router.refresh();
  }

  return (
    <section className="flex gap-3 items-center">
      <button
        onClick={() => setOpenPayment(true)}
        className="text-sm bg-brand text-brand-fg rounded-lg px-3 py-1.5 font-medium hover:opacity-90"
      >
        + Log payment
      </button>
      <button
        onClick={() => setOpenBalance(true)}
        className="text-sm border border-zinc-700 text-zinc-200 rounded-lg px-3 py-1.5 hover:border-zinc-500"
      >
        Update balance
      </button>
      <span className="text-xs text-zinc-500">
        Write straight to the DB. No Excel round-trip.
      </span>

      {openPayment && (
        <PaymentModal onClose={() => setOpenPayment(false)} onSave={logPayment} />
      )}
      {openBalance && (
        <BalanceModal onClose={() => setOpenBalance(false)} onSave={updateBalance} />
      )}
    </section>
  );
}

function PaymentModal({
  onClose, onSave,
}: {
  onClose: () => void;
  onSave: (p: { amount: number; category: string; description: string; txnDate: string }) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("software");
  const [description, setDescription] = useState("");
  const [txnDate, setTxnDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const n = Number(amount);
    if (!isFinite(n) || n === 0) { alert("Enter an amount"); return; }
    if (!description.trim()) { alert("Add a description"); return; }
    setSaving(true);
    await onSave({ amount: n, category, description: description.trim(), txnDate });
    setSaving(false);
  }

  return (
    <ModalShell title="Log a payment" onClose={onClose}>
      <Field label="Amount (£)">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 115"
          autoFocus
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 tabular-nums"
        />
      </Field>
      <Field label="Category">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200"
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Description">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Anthropic monthly"
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
        />
      </Field>
      <Field label="Date">
        <input
          type="date"
          value={txnDate}
          onChange={(e) => setTxnDate(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200"
        />
      </Field>
      <div className="flex gap-2 justify-end mt-3">
        <button onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-200 px-2">Cancel</button>
        <button
          disabled={saving}
          onClick={handleSave}
          className="text-xs bg-brand text-brand-fg rounded px-3 py-1.5 font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}

function BalanceModal({
  onClose, onSave,
}: {
  onClose: () => void;
  onSave: (p: { balance: number; note: string }) => Promise<void>;
}) {
  const [balance, setBalance] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const n = Number(balance);
    if (!isFinite(n) || n < 0) { alert("Enter a non-negative balance"); return; }
    setSaving(true);
    await onSave({ balance: n, note: note.trim() });
    setSaving(false);
  }

  return (
    <ModalShell title="Update Tide balance" onClose={onClose}>
      <Field label="Balance today (£)">
        <input
          type="number"
          step="0.01"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="e.g. 12540.55"
          autoFocus
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 tabular-nums"
        />
      </Field>
      <Field label="Note (optional)">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="after paying Anthropic + Supabase"
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
        />
      </Field>
      <div className="flex gap-2 justify-end mt-3">
        <button onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-200 px-2">Cancel</button>
        <button
          disabled={saving}
          onClick={handleSave}
          className="text-xs bg-brand text-brand-fg rounded px-3 py-1.5 font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-white">{title}</div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
