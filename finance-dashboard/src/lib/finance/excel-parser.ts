/**
 * Excel parser for Etapa_Financial_Model.xlsx.
 *
 * Runs server-side from an uploaded ArrayBuffer. Produces a ParsedImport
 * that the /api/import/excel route hands to the DB writer.
 *
 * Strategy: each sheet has a distinctive structure, so there's a dedicated
 * per-sheet parser. Section headers in the Excel start with two spaces,
 * which is the only reliable structural cue. We track a "current section"
 * as we walk rows and categorise each data row by the section that holds
 * it.
 *
 * Keep each per-sheet function small and independent — the Excel's shape
 * drifts between founder edits, and localised parsers are easier to
 * rescue than one big mega-function.
 */

import * as XLSX from "xlsx";
import type {
  ParsedImport,
  ParsedCashSnapshot,
  ParsedCostItem,
  ParsedAssumption,
  ParsedMilestone,
  ParsedTodo,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Read a whole sheet as a jagged array-of-arrays. Null-preserving so the
 *  section-header detection (row[0] startsWith '  ') stays reliable. */
function sheetToRows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });
}

function isSectionHeader(row: unknown[]): boolean {
  const first = row?.[0];
  return typeof first === "string" && first.startsWith("  ");
}

function trimSectionLabel(label: unknown): string {
  return String(label ?? "").replace(/^\s+/, "").trim();
}

function asString(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalise the Tide-balance date — the cell ships as either a JS Date
 *  (openpyxl reads it as datetime), an Excel serial (XLSX default), or a
 *  string. We want an ISO YYYY-MM-DD. */
function parseDate(v: unknown): string {
  if (!v) return new Date().toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date (days since 1899-12-30).
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + v * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/** Skip-list for subtotal / total rows that are calculated, not stored. */
const BURN_SKIP_PATTERNS = [
  /^total monthly burn/i,
  /^subtotal/i,
  /^total\b/i,
];

function isSubtotalRow(label: string): boolean {
  return BURN_SKIP_PATTERNS.some((re) => re.test(label));
}

/** Heuristic categoriser for cost items — driven by the name so new rows
 *  added to the Assumptions sheet slot into a sensible bucket automatically. */
function categoriseCostItem(name: string): ParsedCostItem["category"] {
  const n = name.toLowerCase();
  if (/tide.*fee|bank fee/.test(n)) return "bank_fees";
  if (/insurance/.test(n)) return "insurance";
  if (/legal|privacy|eula|ico|registered office/.test(n)) return "legal";
  if (/accounting|filing|confirmation|accounts|tax|corporation/.test(n)) return "accounting";
  if (/anthropic|supabase|railway|expo|godaddy|appscreen|perplexity|cursor|hosting|iconikai|holo/.test(n)) return "software";
  return "other";
}

/** Card inference from the "note" column — the Excel uses a convention like
 *  "✓ Card on Tide since …" to annotate which card pays. */
function inferCardOnFile(note: string | undefined): ParsedCostItem["cardOnFile"] | undefined {
  if (!note) return undefined;
  if (/card on tide/i.test(note)) return "tide";
  if (/card on starling/i.test(note)) return "starling";
  return undefined;
}

// ── Sheet: Assumptions ─────────────────────────────────────────────────────
// Five sections in this sheet — each becomes a slice of ParsedImport:
//   "  Cash Position"                         → ParsedImport.cashSnapshot
//   "  Business Costs (monthly, recurring)"   → costItems (isProjected=false)
//   "  Revenue Assumptions (…)"               → assumptions
//   "  Founder Capital Injections (…)"        → assumptions
//   "  Projected / Contingency (…)"           → costItems (isProjected=true)

function parseAssumptionsSheet(ws: XLSX.WorkSheet): {
  cashSnapshot: ParsedCashSnapshot | null;
  costItems: ParsedCostItem[];
  assumptions: ParsedAssumption[];
} {
  const rows = sheetToRows(ws);
  const costItems: ParsedCostItem[] = [];
  const assumptions: ParsedAssumption[] = [];
  let cashSnapshot: ParsedCashSnapshot | null = null;

  let section: "cash" | "costs_actual" | "costs_projected" | "assumptions" | "other" | null = null;
  // Keep a side-channel for "Last updated" so cash snapshot can use its date.
  let cashDate: string | undefined;

  for (const row of rows) {
    if (!row) continue;
    if (isSectionHeader(row)) {
      const label = trimSectionLabel(row[0]).toLowerCase();
      if (label.startsWith("cash position")) section = "cash";
      else if (label.startsWith("business costs")) section = "costs_actual";
      else if (label.startsWith("revenue assumptions") || label.startsWith("founder capital")) section = "assumptions";
      else if (label.startsWith("projected") || label.startsWith("projected / contingency")) section = "costs_projected";
      else section = "other";
      continue;
    }

    const name = asString(row[0]);
    const value = asNumber(row[1]);
    const note = asString(row[2]);
    if (!name) continue;

    switch (section) {
      case "cash": {
        if (/tide balance/i.test(name) && value != null) {
          cashSnapshot = {
            tideBalance: value,
            snapshotDate: cashDate ?? new Date().toISOString().slice(0, 10),
            notes: note,
          };
        } else if (/last updated/i.test(name)) {
          cashDate = parseDate(row[1]);
          if (cashSnapshot && !cashSnapshot.snapshotDate) cashSnapshot.snapshotDate = cashDate;
          if (cashSnapshot) cashSnapshot.snapshotDate = cashDate;
        }
        break;
      }

      case "costs_actual":
      case "costs_projected": {
        if (isSubtotalRow(name)) break;        // skip derived totals
        if (value == null) break;              // empty rows
        const isProjected = section === "costs_projected";
        costItems.push({
          name,
          category: categoriseCostItem(name),
          monthlyAmount: value,
          isProjected,
          cadence: "monthly",
          notes: note,
          cardOnFile: inferCardOnFile(note),
          isActive: value > 0 || (note ? !/cancelled|removed/i.test(note) : true),
        });
        break;
      }

      case "assumptions": {
        if (value == null) break;
        // Heuristic: values < 1 with "%" in name are percentages; otherwise gbp.
        const isPct = /\(%|%\)/.test(name) || (value > 0 && value < 1 && /rate|churn|reserve|fee/i.test(name));
        assumptions.push({
          key: name,
          value,
          unit: isPct ? "pct" : "gbp",
          description: note,
        });
        break;
      }

      default:
        break;
    }
  }

  return { cashSnapshot, costItems, assumptions };
}

// ── Sheet: Milestones ──────────────────────────────────────────────────────
// Sections shaped like "  STAGE N — name · duration". First data row after
// each header is the column-header row (Milestone | When | Target | …) which
// we skip, then each subsequent non-empty row is a milestone.

function parseMilestonesSheet(ws: XLSX.WorkSheet): ParsedMilestone[] {
  const rows = sheetToRows(ws);
  const milestones: ParsedMilestone[] = [];
  let currentStage: number | null = null;
  let currentStageName = "";
  let order = 0;

  for (const row of rows) {
    if (!row) continue;
    const first = asString(row[0]);
    if (!first) continue;

    if (isSectionHeader(row)) {
      const label = trimSectionLabel(row[0]);
      const stageMatch = label.match(/^STAGE\s+(\d+)\s*[—-]\s*(.+?)(?:\s*[·•]\s*.*)?$/i);
      if (stageMatch) {
        currentStage = Number(stageMatch[1]);
        currentStageName = stageMatch[2].trim();
      } else {
        currentStage = null;
      }
      continue;
    }

    // Skip the column-header row of each section.
    if (first === "Milestone") continue;
    if (currentStage === null) continue;
    // Skip trailing "How to use this sheet" stragglers.
    if (/^(•|how to use)/i.test(first)) continue;

    const when = asString(row[1]);
    const target = asString(row[2]);
    const why = asString(row[3]);
    if (!target) continue;

    milestones.push({
      stage: currentStage,
      stageName: currentStageName,
      name: first,
      targetText: target,
      whyItMatters: why,
      dueBy: when,
      displayOrder: order++,
    });
  }

  return milestones;
}

// ── Sheet: To-Do ───────────────────────────────────────────────────────────
// Sections are "  🔴 This week — financial hygiene" etc. After the "Progress:"
// meta row and the column-header row, each non-empty row is a todo.

const STATUS_MAP: Record<string, ParsedTodo["status"]> = {
  "to do":       "todo",
  "todo":        "todo",
  "in progress": "in_progress",
  "done":        "done",
  "resolved":    "resolved",
  "recurring":   "recurring",
  "later":       "later",
  "dormant":     "dormant",
  "skipped":     "skipped",
};

function categoryFromHeader(label: string): ParsedTodo["category"] | null {
  const n = label.toLowerCase();
  if (n.includes("this week")) return "this_week";
  if (n.includes("time-sensitive") || n.includes("time sensitive")) return "time_sensitive";
  if (n.includes("before public app launch") || n.includes("before launch")) return "before_launch";
  if (n.includes("this month")) return "this_month";
  if (n.includes("weekly") || n.includes("monthly rhythm")) return "recurring";
  if (n.includes("after launch")) return "after_launch";
  if (n.includes("runway") || n.includes("dormant")) return "dormant";
  if (n.includes("dashboard build")) return "dashboard_build";
  return null;
}

function parseTodosSheet(ws: XLSX.WorkSheet): ParsedTodo[] {
  const rows = sheetToRows(ws);
  const todos: ParsedTodo[] = [];
  let category: ParsedTodo["category"] | null = null;
  let order = 0;

  for (const row of rows) {
    if (!row) continue;
    const first = asString(row[0]);
    if (!first) continue;

    if (isSectionHeader(row)) {
      category = categoryFromHeader(trimSectionLabel(row[0]));
      continue;
    }
    // Skip the title/progress/header/reference rows.
    if (/^to-do/i.test(first) || /^change status/i.test(first) || /^progress/i.test(first)) continue;
    if (first === "Priority") continue;
    if (/^cross-references/i.test(first) || /^•/.test(first)) continue;

    if (!category) continue;

    // Columns in the Excel: Priority | Item | Why/Context | Status | Done date | Notes | OpenRank
    const priority = first;
    const title = asString(row[1]);
    const context = asString(row[2]);
    const statusRaw = asString(row[3]);
    const doneDateRaw = row[4];
    const notes = asString(row[5]);
    const rank = asNumber(row[6]);

    if (!title) continue;
    const status = STATUS_MAP[(statusRaw ?? "to do").toLowerCase()] ?? "todo";

    todos.push({
      priority,
      category,
      title,
      context,
      status,
      doneDate: doneDateRaw ? parseDate(doneDateRaw) : undefined,
      notes,
      displayOrder: rank != null ? rank : order,
    });
    order++;
  }

  return todos;
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export function parseFinanceModel(buffer: ArrayBuffer): ParsedImport {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  const result: ParsedImport = {
    cashSnapshot: null,
    costItems: [],
    assumptions: [],
    milestones: [],
    todos: [],
  };

  const asmp = wb.Sheets["Assumptions"];
  if (asmp) {
    const parsed = parseAssumptionsSheet(asmp);
    result.cashSnapshot = parsed.cashSnapshot;
    result.costItems = parsed.costItems;
    result.assumptions = parsed.assumptions;
  }

  const ms = wb.Sheets["Milestones"];
  if (ms) result.milestones = parseMilestonesSheet(ms);

  const td = wb.Sheets["To-Do"];
  if (td) result.todos = parseTodosSheet(td);

  return result;
}
