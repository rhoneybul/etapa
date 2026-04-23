/**
 * /todos — grouped todo list with inline status change.
 *
 * Replaces the Monday Excel check. Grouped by category, ordered by the
 * display_order the Excel seeded. Status changes persist via direct
 * Supabase writes (RLS-gated).
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import Nav from "@/components/Nav";

type Todo = {
  id: number;
  priority: string;
  category: string;
  title: string;
  context: string | null;
  status: "todo" | "in_progress" | "done" | "resolved" | "recurring" | "later" | "dormant" | "skipped";
  done_date: string | null;
  notes: string | null;
  display_order: number | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  this_week: "🔴 This week — financial hygiene",
  time_sensitive: "🟠 Time-sensitive",
  before_launch: "🟡 Before public app launch",
  this_month: "🟢 This month — business setup",
  recurring: "🔵 Weekly / monthly rhythm",
  after_launch: "🟣 After launch — track monthly",
  dormant: "⚫ Activate only if runway < 9 months",
  dashboard_build: "⬛ Dashboard build",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

const STATUS_OPTIONS: Todo["status"][] = ["todo", "in_progress", "done", "resolved", "recurring", "later", "dormant", "skipped"];

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"open" | "all" | "done">("open");

  useEffect(() => {
    const supa = getBrowserSupabase();
    (async () => {
      const { data: { user } } = await supa.auth.getUser();
      setEmail(user?.email ?? null);
      const { data } = await supa.schema("finance").from("todos")
        .select("*")
        .order("display_order", { ascending: true, nullsFirst: false });
      setTodos((data as Todo[]) ?? []);
    })();
  }, []);

  const grouped = useMemo(() => {
    if (!todos) return null;
    const filtered = todos.filter((t) =>
      filter === "all" ? true
        : filter === "done" ? t.status === "done"
        : !["done", "resolved", "skipped"].includes(t.status));
    const map = new Map<string, Todo[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const t of filtered) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return map;
  }, [todos, filter]);

  async function updateStatus(t: Todo, status: Todo["status"]) {
    setSavingId(t.id);
    const patch: Partial<Todo> = { status };
    // Auto-fill done_date when flipping to done.
    if (status === "done" && !t.done_date) patch.done_date = new Date().toISOString().slice(0, 10);
    // Clear done_date when reopening.
    if (status !== "done" && t.done_date) patch.done_date = null;
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("todos").update(patch).eq("id", t.id);
    if (!error && todos) {
      setTodos(todos.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    }
    setSavingId(null);
  }

  async function addNote(t: Todo, notes: string) {
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("todos").update({ notes }).eq("id", t.id);
    if (!error && todos) {
      setTodos(todos.map((x) => (x.id === t.id ? { ...x, notes } : x)));
    }
  }

  const counts = todos ? {
    open: todos.filter((t) => !["done", "resolved", "skipped"].includes(t.status)).length,
    done: todos.filter((t) => t.status === "done").length,
    total: todos.length,
  } : null;

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

        {!grouped ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="space-y-6">
            {CATEGORY_ORDER.map((cat) => {
              const items = grouped.get(cat) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={cat}>
                  <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{CATEGORY_LABELS[cat] ?? cat}</h2>
                  <ul className="space-y-1">
                    {items.map((t) => (
                      <li key={t.id} className="group rounded border border-zinc-800 bg-zinc-950 p-3 hover:border-zinc-700 transition">
                        <div className="flex items-start gap-3">
                          <span className="shrink-0 w-4 text-center text-sm">{t.priority}</span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm ${t.status === "done" || t.status === "resolved" ? "line-through text-zinc-500" : "text-zinc-100"}`}>
                              {t.title}
                            </div>
                            {t.context && <div className="text-xs text-zinc-500 mt-1">{t.context}</div>}
                            {t.notes && <div className="text-xs text-amber-300 mt-1">📝 {t.notes}</div>}
                          </div>
                          <select
                            value={t.status}
                            onChange={(e) => updateStatus(t, e.target.value as Todo["status"])}
                            disabled={savingId === t.id}
                            className="shrink-0 bg-zinc-900 border border-zinc-800 rounded text-xs px-2 py-1 text-zinc-300"
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>{s.replace("_", " ")}</option>
                            ))}
                          </select>
                        </div>
                        <details className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <summary className="text-xs text-zinc-500 cursor-pointer">Add / edit note</summary>
                          <textarea
                            defaultValue={t.notes ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (t.notes ?? "")) addNote(t, v);
                            }}
                            placeholder="Any context you want to remember next time you look at this…"
                            className="mt-2 w-full bg-zinc-900 border border-zinc-800 rounded text-xs p-2 text-zinc-200"
                            rows={2}
                          />
                        </details>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
