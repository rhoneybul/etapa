/**
 * /milestones — the Milestones sheet as a live page.
 *
 * Grouped by stage. Each row has a "hit" checkbox; checking it stamps the
 * hit_date with today's date. The current-stage calculation matches the
 * one on the home page so flipping a milestone here updates that badge.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import Nav from "@/components/Nav";
import { currentStage } from "@/lib/finance/calculations";

type Milestone = {
  id: number;
  stage: number;
  stage_name: string;
  name: string;
  target_text: string;
  why_it_matters: string | null;
  due_by: string | null;
  is_hit: boolean;
  hit_date: string | null;
  actual_value: string | null;
  display_order: number | null;
};

export default function MilestonesPage() {
  const [items, setItems] = useState<Milestone[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    const supa = getBrowserSupabase();
    (async () => {
      const { data: { user } } = await supa.auth.getUser();
      setEmail(user?.email ?? null);
      const { data } = await supa.schema("finance").from("milestones")
        .select("*")
        .order("stage", { ascending: true })
        .order("display_order", { ascending: true, nullsFirst: false });
      setItems((data as Milestone[]) ?? []);
    })();
  }, []);

  async function toggleHit(m: Milestone) {
    setSavingId(m.id);
    const patch: Partial<Milestone> = {
      is_hit: !m.is_hit,
      hit_date: !m.is_hit ? new Date().toISOString().slice(0, 10) : null,
    };
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("milestones").update(patch).eq("id", m.id);
    if (!error && items) {
      setItems(items.map((x) => (x.id === m.id ? { ...x, ...patch } : x)));
    }
    setSavingId(null);
  }

  async function updateActual(m: Milestone, actual: string) {
    const supa = getBrowserSupabase();
    const { error } = await supa.schema("finance").from("milestones").update({ actual_value: actual }).eq("id", m.id);
    if (!error && items) {
      setItems(items.map((x) => (x.id === m.id ? { ...x, actual_value: actual } : x)));
    }
  }

  const byStage = useMemo(() => {
    if (!items) return null;
    const map = new Map<number, { name: string; items: Milestone[] }>();
    for (const m of items) {
      const s = map.get(m.stage) ?? { name: m.stage_name, items: [] };
      s.items.push(m);
      map.set(m.stage, s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [items]);

  const stageInfo = useMemo(
    () => items ? currentStage(items.map((m) => ({ stage: m.stage, is_hit: m.is_hit }))) : null,
    [items],
  );

  return (
    <>
      <Nav email={email} />
      <main className="max-w-4xl mx-auto p-6 md:p-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold">Milestones</h1>
          {stageInfo && (
            <p className="text-sm text-zinc-500 mt-1">
              Current stage: <strong className="text-white">Stage {stageInfo.stage}</strong>
              <span className="text-zinc-600"> · {stageInfo.hitInStage}/{stageInfo.totalInStage} milestones hit in this stage</span>
            </p>
          )}
        </header>

        {!byStage ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="space-y-8">
            {byStage.map(([stage, info]) => {
              const hit = info.items.filter((m) => m.is_hit).length;
              return (
                <section key={stage}>
                  <h2 className="text-sm font-semibold text-white mb-3">
                    Stage {stage} — {info.name}
                    <span className="text-zinc-500 text-xs font-normal ml-2">{hit} / {info.items.length}</span>
                  </h2>
                  <ul className="space-y-2">
                    {info.items.map((m) => (
                      <li key={m.id} className="rounded border border-zinc-800 bg-zinc-950 p-3">
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleHit(m)}
                            disabled={savingId === m.id}
                            aria-label={m.is_hit ? "Mark not hit" : "Mark hit"}
                            className={`shrink-0 w-5 h-5 mt-0.5 rounded border transition
                              ${m.is_hit
                                ? "bg-emerald-500 border-emerald-500 text-white"
                                : "border-zinc-600 hover:border-zinc-400"}`}
                          >
                            {m.is_hit ? <span className="block text-xs leading-5">✓</span> : null}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm ${m.is_hit ? "line-through text-zinc-500" : "text-zinc-100"}`}>
                              {m.name}
                            </div>
                            <div className="text-xs text-zinc-400 mt-0.5">
                              <span className="text-zinc-500">Target:</span> {m.target_text}
                              {m.due_by && <span className="text-zinc-500"> · {m.due_by}</span>}
                            </div>
                            {m.why_it_matters && (
                              <div className="text-xs text-zinc-500 mt-1 italic">{m.why_it_matters}</div>
                            )}
                            {m.is_hit && m.hit_date && (
                              <div className="text-xs text-emerald-400 mt-1">Hit {m.hit_date}</div>
                            )}
                            <input
                              type="text"
                              defaultValue={m.actual_value ?? ""}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v !== (m.actual_value ?? "")) updateActual(m, v);
                              }}
                              placeholder="Actual value (once hit)"
                              className="mt-2 w-full bg-zinc-900 border border-zinc-800 rounded text-xs px-2 py-1 text-zinc-200"
                            />
                          </div>
                        </div>
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
