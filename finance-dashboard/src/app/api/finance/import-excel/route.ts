/**
 * POST /api/finance/import-excel
 *
 * Accepts a multipart/form-data upload with field name `file` (the .xlsx).
 * Parses server-side, deletes the existing rows in each target finance
 * table, inserts the fresh parsed data, and writes an audit row to
 * `finance.imports`.
 *
 * Auth: the middleware already guards the route; inside here the
 * getServerSupabase() client carries the user's cookies so every write
 * goes through RLS keyed on finance.admin_allowlist. No service-role key
 * is used — this is deliberate so a runaway bug can't bypass the
 * allowlist.
 *
 * Atomicity: Supabase JS can't run a multi-table transaction, so the
 * approach is "delete + insert per table" in a fixed order. If a write
 * fails partway, re-uploading the same file overwrites everything. The
 * `finance.imports` row is written last with a success counts payload;
 * if it isn't there, the import didn't complete.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { parseFinanceModel } from "@/lib/finance/excel-parser";
import type { ImportSummary } from "@/lib/finance/types";

// Bigger payload ceiling than the App Router default — the parsed JSON can
// be a few hundred KB for a 15-sheet workbook.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse<ImportSummary>> {
  const supabase = await getServerSupabase();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Not authenticated", warnings: [] }, { status: 401 });
  }

  // Grab the uploaded file from multipart form data.
  let file: File | null = null;
  try {
    const form = await request.formData();
    const raw = form.get("file");
    if (raw && raw instanceof File) file = raw;
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: `Could not read upload: ${err instanceof Error ? err.message : "unknown"}`, warnings: [] },
      { status: 400 },
    );
  }
  if (!file) {
    return NextResponse.json({ ok: false, error: "No file provided (expected field 'file')", warnings: [] }, { status: 400 });
  }
  if (!/\.xlsx?$/i.test(file.name)) {
    return NextResponse.json({ ok: false, error: "File must be an .xlsx spreadsheet", warnings: [] }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "File exceeds 10 MB limit", warnings: [] }, { status: 400 });
  }

  // Parse. parseFinanceModel throws on totally-broken files; normal shape
  // issues just produce empty slices + warnings (returned below).
  const buffer = await file.arrayBuffer();
  let parsed;
  try {
    parsed = parseFinanceModel(buffer);
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: `Parse failed: ${err instanceof Error ? err.message : "unknown"}`, warnings: [] },
      { status: 400 },
    );
  }

  const warnings: string[] = [];

  // Empty-slice warnings — surface so the user knows the Excel didn't have
  // what we expected, rather than silently clobbering.
  if (!parsed.cashSnapshot) warnings.push("No Tide balance found in Assumptions → Cash Position — skipping cash snapshot.");
  if (parsed.costItems.length === 0) warnings.push("No cost items parsed — check the Business Costs / Projected sections.");
  if (parsed.milestones.length === 0) warnings.push("No milestones parsed — the Milestones sheet may be empty.");
  if (parsed.todos.length === 0) warnings.push("No todos parsed — the To-Do sheet may be empty.");

  // ── 1. Replace cost_items ───────────────────────────────────────────────
  {
    const { error: delErr } = await supabase.schema("finance").from("cost_items").delete().gt("id", 0);
    if (delErr) return failure(`Deleting existing cost_items failed: ${delErr.message}`, warnings);

    if (parsed.costItems.length > 0) {
      const rows = parsed.costItems.map((c) => ({
        name: c.name,
        category: c.category,
        monthly_amount: c.monthlyAmount,
        is_projected: c.isProjected,
        is_active: c.isActive ?? true,
        cadence: c.cadence ?? "monthly",
        notes: c.notes ?? null,
        card_on_file: c.cardOnFile ?? null,
      }));
      const { error: insErr } = await supabase.schema("finance").from("cost_items").insert(rows);
      if (insErr) return failure(`Inserting cost_items failed: ${insErr.message}`, warnings);
    }
  }

  // ── 2. Upsert assumptions (preserve keys that the Excel doesn't mention) ──
  // assumptions have a stable keyed schema — upserting is safer than delete+insert
  // because the DB might hold runtime-adjusted values we don't want to lose.
  if (parsed.assumptions.length > 0) {
    const rows = parsed.assumptions.map((a) => ({
      key: a.key,
      value: a.value,
      unit: a.unit ?? null,
      description: a.description ?? null,
      updated_at: new Date().toISOString(),
    }));
    const { error: upErr } = await supabase
      .schema("finance")
      .from("assumptions")
      .upsert(rows, { onConflict: "key" });
    if (upErr) return failure(`Upserting assumptions failed: ${upErr.message}`, warnings);
  }

  // ── 3. Replace milestones ───────────────────────────────────────────────
  {
    const { error: delErr } = await supabase.schema("finance").from("milestones").delete().gt("id", 0);
    if (delErr) return failure(`Deleting existing milestones failed: ${delErr.message}`, warnings);

    if (parsed.milestones.length > 0) {
      const rows = parsed.milestones.map((m) => ({
        stage: m.stage,
        stage_name: m.stageName,
        name: m.name,
        target_text: m.targetText,
        why_it_matters: m.whyItMatters ?? null,
        due_by: m.dueBy ?? null,
        display_order: m.displayOrder,
      }));
      const { error: insErr } = await supabase.schema("finance").from("milestones").insert(rows);
      if (insErr) return failure(`Inserting milestones failed: ${insErr.message}`, warnings);
    }
  }

  // ── 4. Replace todos ────────────────────────────────────────────────────
  {
    const { error: delErr } = await supabase.schema("finance").from("todos").delete().gt("id", 0);
    if (delErr) return failure(`Deleting existing todos failed: ${delErr.message}`, warnings);

    if (parsed.todos.length > 0) {
      const rows = parsed.todos.map((t) => ({
        priority: t.priority,
        category: t.category,
        title: t.title,
        context: t.context ?? null,
        status: t.status,
        done_date: t.doneDate ?? null,
        notes: t.notes ?? null,
        display_order: t.displayOrder ?? null,
      }));
      const { error: insErr } = await supabase.schema("finance").from("todos").insert(rows);
      if (insErr) return failure(`Inserting todos failed: ${insErr.message}`, warnings);
    }
  }

  // ── 5. Cash snapshot (append-only — we keep a history) ─────────────────
  if (parsed.cashSnapshot) {
    const { error: csErr } = await supabase.schema("finance").from("cash_snapshots").insert({
      tide_balance: parsed.cashSnapshot.tideBalance,
      snapshot_date: parsed.cashSnapshot.snapshotDate,
      source: "excel_import",
      notes: parsed.cashSnapshot.notes ?? null,
    });
    if (csErr) return failure(`Inserting cash_snapshot failed: ${csErr.message}`, warnings);
  }

  // ── 6. Audit row ────────────────────────────────────────────────────────
  const counts = {
    cashSnapshot: parsed.cashSnapshot ? 1 : 0,
    costItems: parsed.costItems.length,
    assumptions: parsed.assumptions.length,
    milestones: parsed.milestones.length,
    todos: parsed.todos.length,
  };
  const { data: audit, error: auditErr } = await supabase
    .schema("finance")
    .from("imports")
    .insert({
      imported_by: user.email ?? user.id,
      filename: file.name,
      file_size: file.size,
      sheet_counts: counts,
      status: "applied",
      notes: warnings.length ? warnings.join(" | ") : null,
    })
    .select("id")
    .single();
  if (auditErr) return failure(`Writing imports audit row failed: ${auditErr.message}`, warnings);

  return NextResponse.json({ ok: true, counts, warnings, importId: audit.id });
}

function failure(error: string, warnings: string[]): NextResponse<ImportSummary> {
  return NextResponse.json({ ok: false, error, warnings }, { status: 500 });
}
