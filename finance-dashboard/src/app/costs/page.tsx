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
  next_month_override: number | null;
  override_note: string | null;
  override_set_at: string | null;
  // When the next charge is expected to land. Drives the cash-projection
  // chart (moves the override into the correct month) and lets
  // projected/contingency items show a due date directly in the table.
  next_charge_date: string | null;
  last_paid_date: string | null;
  last_paid_amount: number | null;
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
              <CostRow key={c.id} c={c} onUpdate={onUpdate} onDelete={onDelete} />
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-xs text-zinc-500">No items yet. Click &quot;+ Add item&quot;.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Per-row component so the watch/override state (open/closed) can live
 * locally without rerendering the whole table on every keystroke.
 */
function CostRow({
  c, onUpdate, onDelete,
}: {
  c: Cost;
  onUpdate: (id: number, patch: Partial<Cost>) => void;
  onDelete: (id: number) => void;
}) {
  const hasOverride = c.next_month_override != null;

  function setOverride(amount: number | null, note: string | null, chargeDate: string | null) {
    onUpdate(c.id, {
      next_month_override: amount,
      override_note: note,
      override_set_at: amount == null ? null : new Date().toISOString(),
      // Date clears when override clears. Kept separately for projected items
      // which can own a date without owning an amount override.
      next_charge_date: amount == null ? null : chargeDate,
    });
  }

  return (
    <>
      <tr className="hover:bg-zinc-900/40">
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
          {hasOverride && (
            <div className="text-xs text-amber-400 mt-0.5 tabular-nums">
              next: £{c.next_month_override}
              {c.next_charge_date && <span className="ml-1 text-amber-500/80">({c.next_charge_date})</span>}
            </div>
          )}
        </td>
        <td className="px-3 py-2">
          <input
            defaultValue={c.notes ?? ""}
            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.notes ?? "")) onUpdate(c.id, { notes: v || null }); }}
            className="bg-transparent text-zinc-400 w-full outline-none text-xs"
          />
          {/* Inline due-date input for projected/contingency rows — they often
              have a known timing (annual filing due Nov, Apple dev renewal
              March) that should show up in the cash projection. */}
          {c.is_projected && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-zinc-600">Due</span>
              <input
                type="date"
                defaultValue={c.next_charge_date ?? ""}
                onBlur={(e) => {
                  const v = e.target.value || null;
                  if (v !== c.next_charge_date) onUpdate(c.id, { next_charge_date: v });
                }}
                className="bg-transparent text-zinc-400 text-xs outline-none"
              />
            </div>
          )}
          {c.last_paid_date && (
            <div className="text-xs text-emerald-400 mt-0.5">
              ✓ Paid {c.last_paid_amount != null ? `£${c.last_paid_amount}` : ""} on {c.last_paid_date}
            </div>
          )}
        </td>
        <td className="px-3 py-2 text-center">
          <input
            type="checkbox"
            checked={c.is_active}
            onChange={(e) => onUpdate(c.id, { is_active: e.target.checked })}
          />
        </td>
        <td className="px-3 py-2">
          <div className="flex gap-1 justify-end">
            <PaidControl c={c} onUpdate={onUpdate} />
            <WatchControl c={c} setOverride={setOverride} hasOverride={hasOverride} />
            <button onClick={() => onDelete(c.id)} className="text-zinc-600 hover:text-red-400 text-xs">×</button>
          </div>
        </td>
      </tr>
    </>
  );
}

/**
 * "£" button: record a lump-sum payment. Opens an inline panel asking for
 * date + amount. Useful for annual items (GoDaddy, Apple Developer Program)
 * so the UI can show "already paid for this year" without affecting the
 * monthly_amount that drives runway maths.
 */
function PaidControl({
  c, onUpdate,
}: {
  c: Cost;
  onUpdate: (id: number, patch: Partial<Cost>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string>(c.last_paid_date ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<string>(c.last_paid_amount != null ? String(c.last_paid_amount) : "");

  function save() {
    const n = amount ? Number(amount) : null;
    onUpdate(c.id, { last_paid_date: date, last_paid_amount: n });
    setOpen(false);
  }

  function clear() {
    onUpdate(c.id, { last_paid_date: null, last_paid_amount: null });
    setAmount("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title={c.last_paid_date ? `Paid ${c.last_paid_amount != null ? `£${c.last_paid_amount}` : ""} on ${c.last_paid_date}` : "Record a lump-sum payment"}
        className={`text-xs px-1.5 py-0.5 rounded border ${
          c.last_paid_date
            ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
            : "border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-300"
        }`}
      >
        £
      </button>
    );
  }

  return (
    <div className="absolute right-16 bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl z-20 w-64 text-left">
      <div className="text-xs font-semibold text-white mb-2">Record lump payment</div>
      <label className="block text-xs text-zinc-400 mb-1">Date</label>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
      />
      <label className="block text-xs text-zinc-400 mb-1 mt-2">Amount paid (£)</label>
      <input
        type="number"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="e.g. 80.00 for annual Apple Dev"
        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 tabular-nums"
      />
      <div className="flex gap-2 justify-end mt-2">
        {c.last_paid_date && (
          <button onClick={clear} className="text-xs text-zinc-400 hover:text-zinc-200 px-2">Clear</button>
        )}
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-200 px-2">Cancel</button>
        <button onClick={save} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded px-3 py-1 font-medium">Save</button>
      </div>
    </div>
  );
}

/**
 * Inline watch/override control. Collapsed state is an icon button with
 * colour indicating whether an override is active. Expanded state is a
 * small panel with amount + note + clear.
 */
function WatchControl({
  c, setOverride, hasOverride,
}: {
  c: Cost;
  setOverride: (amount: number | null, note: string | null, chargeDate: string | null) => void;
  hasOverride: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>(c.next_month_override != null ? String(c.next_month_override) : "");
  const [note, setNote] = useState<string>(c.override_note ?? "");
  const [chargeDate, setChargeDate] = useState<string>(c.next_charge_date ?? "");

  function save() {
    const n = Number(amount);
    if (!amount || !isFinite(n)) { setOverride(null, null, null); }
    else { setOverride(n, note.trim() || null, chargeDate || null); }
    setOpen(false);
  }

  function clear() {
    setAmount("");
    setNote("");
    setChargeDate("");
    setOverride(null, null, null);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title={hasOverride ? `Flagged: next charge £${c.next_month_override}${c.next_charge_date ? ` on ${c.next_charge_date}` : ""}${c.override_note ? ` — ${c.override_note}` : ""}` : "Flag as abnormally high / low next month"}
        className={`text-xs px-1.5 py-0.5 rounded border ${
          hasOverride
            ? "border-amber-700 bg-amber-950/40 text-amber-300"
            : "border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-300"
        }`}
      >
        ⚑
      </button>
    );
  }

  return (
    <div className="absolute right-8 bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl z-20 w-64 text-left">
      <div className="text-xs font-semibold text-white mb-2">Flag next charge</div>
      <label className="block text-xs text-zinc-400 mb-1">Expected amount (£)</label>
      <input
        type="number"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={`Normally £${c.monthly_amount}`}
        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 tabular-nums"
        autoFocus
      />
      {/* Date field — drives which month the chart + KPIs apply the override to. */}
      <label className="block text-xs text-zinc-400 mb-1 mt-2">When (optional)</label>
      <input
        type="date"
        value={chargeDate}
        onChange={(e) => setChargeDate(e.target.value)}
        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200"
      />
      <label className="block text-xs text-zinc-400 mb-1 mt-2">Why</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. bulk test run pushed API usage up"
        rows={2}
        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200"
      />
      <div className="flex gap-2 justify-end mt-2">
        {hasOverride && (
          <button onClick={clear} className="text-xs text-zinc-400 hover:text-zinc-200 px-2">Clear</button>
        )}
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-200 px-2">Cancel</button>
        <button onClick={save} className="text-xs bg-brand text-brand-fg rounded px-3 py-1 font-medium">Save</button>
      </div>
    </div>
  );
}
