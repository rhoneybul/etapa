/**
 * /todos — grouped list with:
 *   - Quick checkbox (flip between todo ↔ done in one click)
 *   - Click row → detail modal with full status dropdown + larger notes editor
 *   - Recurring items get their own section at the top, with period-aware
 *     state (weekly/monthly/quarterly reset implicit in render).
 *
 * All writes go through RLS; no service-role key. `last_completed_at` is
 * the single field that drives recurring-check state — the period-start
 * comparison happens client-side so there's no cron.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import Nav from "@/components/Nav";
import { isDoneThisPeriod, nextDueLabel, type Cadence } from "@/lib/finance/recurring";

type Status = "todo" | "in_progress" | "done" | "resolved" | "recurring" | "later" | "dormant" | "skipped";

type Todo = {
  id: number;
  priority: string;
  category: string;
  title: string;
  context: string | null;
  status: Status;
  done_date: string | null;
  notes: string | null;
  display_order: number | null;
  cadence: Cadence | null;
  last_completed_at: string | null;
  created_at?: string;
  updated_at?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  this_week:      "🔴 This week — financial hygiene",
  time_sensitive: "🟠 Time-sensitive",
  before_launch:  "🟡 Before public app launch",
  this_month:     "🟢 This month — business setup",
  after_launch:   "🟣 After launch — track monthly",
  dormant:        "⚫ Activate only if runway < 9 months",
  dashboard_build: "⬛ Dashboard build",
};
const NON_RECURRING_ORDER = Object.keys(CATEGORY_LABELS);
const STATUS_OPTIONS: Status[] = ["todo", "in_progress", "done", "resolved", "recurring", "later", "dormant", "skipped"];

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all" | "done">("open");
  const [selected, setSelected] = useState<Todo | null>(null);
  const [now, setNow] = useState(new Date());

  // Re-render every minute so recurring-period transitions happen without
  // a page reload. Cheap: just state setter.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const supa = getBrowserSupabase();
    const { data: { user } } = await supa.auth.getUser();
    setEmail(user?.email ?? null);
    const { data } = await supa.schema("finance").from("todos")
      .select("*")
      .order("display_order", { ascending: true, nullsFirst: false });
    setTodos((data as Todo[]) ?? []);
  }

  // ── Optimistic mutation ────────────────────────────────────────────────
  async function updateTodo(id: number, patch: Partial<Todo>) {
    if (!todos) return;
    // Optimistic: apply locally first, then sync. If sync fails, refresh.
    setTodos(todos.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    if (selected?.id === id) setSelected({ ...selected, ...patch });
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("todos").update(patch).eq("id", id);
    if (error) { console.warn("todo update failed, refetching:", error.message); refresh(); }
  }

  // Checkbox toggle — behaviour depends on whether the todo is recurring.
  function toggle(t: Todo) {
    if (t.category === "recurring" && t.cadence) {
      // Recurring: set last_completed_at = now (or null to un-tick).
      const done = isDoneThisPeriod(t.last_completed_at, t.cadence, now);
      updateTodo(t.id, { last_completed_at: done ? null : new Date().toISOString() });
      return;
    }
    // Non-recurring: flip between todo ↔ done (and stamp done_date).
    if (t.status === "done") {
      updateTodo(t.id, { status: "todo", done_date: null });
    } else {
      updateTodo(t.id, { status: "done", done_date: new Date().toISOString().slice(0, 10) });
    }
  }

  // ── Grouping ───────────────────────────────────────────────────────────
  const { recurringItems, nonRecurringByCategory, counts } = useMemo(() => {
    const empty = {
      recurringItems: [] as Todo[],
      nonRecurringByCategory: new Map<string, Todo[]>(),
      counts: { open: 0, done: 0, total: 0 },
    };
    if (!todos) return empty;

    const isOpen = (t: Todo) => !["done", "resolved", "skipped"].includes(t.status)
      && !(t.category === "recurring" && t.cadence && isDoneThisPeriod(t.last_completed_at, t.cadence, now));
    const isDone = (t: Todo) => t.status === "done"
      || (t.category === "recurring" && t.cadence && isDoneThisPeriod(t.last_completed_at, t.cadence, now));
    const matchFilter = (t: Todo) => filter === "all" ? true : filter === "done" ? isDone(t) : isOpen(t);

    const filtered = todos.filter(matchFilter);
    const recurring = filtered.filter((t) => t.category === "recurring");
    const map = new Map<string, Todo[]>();
    for (const cat of NON_RECURRING_ORDER) map.set(cat, []);
    for (const t of filtered) {
      if (t.category === "recurring") continue;
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return {
      recurringItems: recurring,
      nonRecurringByCategory: map,
      counts: {
        open: todos.filter(isOpen).length,
        done: todos.filter(isDone).length,
        total: todos.length,
      },
    };
  }, [todos, filter, now]);

  return (
    <>
      <Nav email={email} />
      <main className="max-w-4xl mx-auto p-6 md:p-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Todos</h1>
            {counts && (
              <p className="text-sm text-zinc-500 mt-1">{counts.open} open · {counts.done} done · {counts.total} total</p>
            )}
          </div>
          <div className="flex gap-1 text-xs">
            {(["open", "all", "done"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded capitalize ${filter === f ? "bg-brand text-brand-fg" : "bg-zinc-900 text-zinc-400 hover:text-white"}`}>
                {f}
              </button>
            ))}
          </div>
        </header>

        {!todos ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="space-y-8">
            {/* Recurring section first — it's the daily / weekly / monthly pulse. */}
            {recurringItems.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                  🔵 Recurring — weekly / monthly rhythm
                </h2>
                <ul className="space-y-1">
                  {recurringItems.map((t) => (
                    <RecurringRow key={t.id} t={t} now={now} onToggle={() => toggle(t)} onOpen={() => setSelected(t)} />
                  ))}
                </ul>
              </section>
            )}

            {NON_RECURRING_ORDER.map((cat) => {
              const items = nonRecurringByCategory.get(cat) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={cat}>
                  <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{CATEGORY_LABELS[cat] ?? cat}</h2>
                  <ul className="space-y-1">
                    {items.map((t) => (
                      <TodoRow key={t.id} t={t} onToggle={() => toggle(t)} onOpen={() => setSelected(t)} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {selected && (
        <TodoDetailModal todo={selected} onClose={() => setSelected(null)} onUpdate={(patch) => updateTodo(selected.id, patch)} />
      )}
    </>
  );
}

// ── Rows ───────────────────────────────────────────────────────────────

function TodoRow({ t, onToggle, onOpen }: { t: Todo; onToggle: () => void; onOpen: () => void }) {
  const done = t.status === "done" || t.status === "resolved";
  return (
    <li className="group rounded border border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition">
      <div className="flex items-start gap-3 p-3">
        <button
          onClick={onToggle}
          aria-label={done ? "Mark as todo" : "Mark as done"}
          className={`shrink-0 w-5 h-5 mt-0.5 rounded border transition flex items-center justify-center ${
            done ? "bg-emerald-500 border-emerald-500 text-white" : "border-zinc-600 hover:border-zinc-400"
          }`}
        >
          {done && <span className="text-xs leading-none">✓</span>}
        </button>
        <button
          onClick={onOpen}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm">{t.priority}</span>
            <span className={`text-sm ${done ? "line-through text-zinc-500" : "text-zinc-100"}`}>{t.title}</span>
          </div>
          {t.context && <div className="text-xs text-zinc-500 mt-1 truncate">{t.context}</div>}
          {t.notes && <div className="text-xs text-amber-300 mt-1 truncate">📝 {t.notes}</div>}
        </button>
      </div>
    </li>
  );
}

function RecurringRow({
  t, now, onToggle, onOpen,
}: { t: Todo; now: Date; onToggle: () => void; onOpen: () => void }) {
  const cadence = t.cadence ?? "weekly";
  const done = isDoneThisPeriod(t.last_completed_at, cadence, now);
  const nextLabel = nextDueLabel(cadence, now);
  return (
    <li className="rounded border border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition">
      <div className="flex items-start gap-3 p-3">
        <button
          onClick={onToggle}
          aria-label={done ? "Un-check this period" : "Mark done this period"}
          className={`shrink-0 w-5 h-5 mt-0.5 rounded border transition flex items-center justify-center ${
            done ? "bg-blue-500 border-blue-500 text-white" : "border-zinc-600 hover:border-zinc-400"
          }`}
        >
          {done && <span className="text-xs leading-none">✓</span>}
        </button>
        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm">{t.priority}</span>
            <span className={`text-sm ${done ? "text-zinc-400" : "text-zinc-100"}`}>{t.title}</span>
            <span className="ml-auto text-xs text-zinc-500 capitalize">{cadence}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
            <span>{nextLabel}</span>
            {t.last_completed_at && (
              <span>Last done {new Date(t.last_completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            )}
          </div>
        </button>
      </div>
    </li>
  );
}

// ── Detail modal ───────────────────────────────────────────────────────

function TodoDetailModal({
  todo, onClose, onUpdate,
}: {
  todo: Todo;
  onClose: () => void;
  onUpdate: (patch: Partial<Todo>) => void;
}) {
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [context, setContext] = useState(todo.context ?? "");
  const [title, setTitle] = useState(todo.title);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        <header className="flex items-center justify-between p-4 border-b border-zinc-800 sticky top-0 bg-zinc-950/95 backdrop-blur">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-lg">{todo.priority}</span>
            <span className="text-xs text-zinc-500 uppercase tracking-wide">{todo.category.replace(/_/g, " ")}</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
        </header>

        <div className="p-5 space-y-5">
          {/* Title — editable */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title !== todo.title && onUpdate({ title })}
              className="w-full bg-transparent text-lg font-medium text-zinc-100 outline-none border-b border-zinc-800 focus:border-zinc-600 pb-1"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">Status</label>
            <select
              value={todo.status}
              onChange={(e) => onUpdate({ status: e.target.value as Status })}
              className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-200"
            >
              {STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s.replace("_", " ")}</option>))}
            </select>
            {todo.done_date && (
              <span className="ml-3 text-xs text-emerald-400">Completed {todo.done_date}</span>
            )}
          </div>

          {/* Recurring controls */}
          {todo.category === "recurring" && (
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">Cadence</label>
              <select
                value={todo.cadence ?? "weekly"}
                onChange={(e) => onUpdate({ cadence: e.target.value as Cadence })}
                className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-200"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
              {todo.last_completed_at && (
                <div className="text-xs text-zinc-500 mt-2">
                  Last ticked: {new Date(todo.last_completed_at).toLocaleString("en-GB")}
                </div>
              )}
            </div>
          )}

          {/* Context */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">Why / context</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              onBlur={() => context !== (todo.context ?? "") && onUpdate({ context: context.trim() || null })}
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200"
              placeholder="Why this matters, extra detail from when it was created"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">Notes (your thinking)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (todo.notes ?? "") && onUpdate({ notes: notes.trim() || null })}
              rows={5}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-amber-200"
              placeholder="Context you want to remember next time you look at this. Saves on blur."
            />
          </div>

          {/* Metadata footer */}
          <div className="text-xs text-zinc-600 flex gap-4 pt-3 border-t border-zinc-800">
            <span>#{todo.id}</span>
            {todo.created_at && <span>Created {new Date(todo.created_at).toLocaleDateString("en-GB")}</span>}
            {todo.updated_at && <span>Updated {new Date(todo.updated_at).toLocaleDateString("en-GB")}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
