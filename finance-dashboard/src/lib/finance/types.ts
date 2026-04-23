/**
 * Shared types for the Excel → DB import flow.
 *
 * `ParsedImport` is the normalised intermediate shape produced by the
 * parser. The /api/import/excel endpoint takes one of these and writes
 * each slice to its finance table.
 */

export type ParsedCashSnapshot = {
  tideBalance: number;
  snapshotDate: string;  // ISO date YYYY-MM-DD
  notes?: string;
};

export type ParsedCostItem = {
  name: string;
  category: "software" | "legal" | "accounting" | "insurance" | "bank_fees" | "marketing" | "other";
  monthlyAmount: number;
  isProjected: boolean;
  cadence?: "monthly" | "annual" | "usage";
  notes?: string;
  cardOnFile?: "tide" | "starling" | "unknown";
  isActive?: boolean;
};

export type ParsedAssumption = {
  key: string;
  value: number;
  unit?: "pct" | "gbp" | "months" | "count";
  description?: string;
};

export type ParsedMilestone = {
  stage: number;
  stageName: string;
  name: string;
  targetText: string;
  whyItMatters?: string;
  dueBy?: string;
  displayOrder: number;
};

export type ParsedTodo = {
  priority: string;               // emoji marker
  category:
    | "this_week"
    | "time_sensitive"
    | "before_launch"
    | "this_month"
    | "recurring"
    | "after_launch"
    | "dormant"
    | "dashboard_build";
  title: string;
  context?: string;
  status: "todo" | "in_progress" | "done" | "resolved" | "recurring" | "later" | "dormant" | "skipped";
  doneDate?: string;              // ISO date
  notes?: string;
  displayOrder?: number;
};

export type ParsedImport = {
  cashSnapshot: ParsedCashSnapshot | null;
  costItems: ParsedCostItem[];
  assumptions: ParsedAssumption[];
  milestones: ParsedMilestone[];
  todos: ParsedTodo[];
};

export type ImportSummary = {
  ok: true;
  counts: {
    cashSnapshot: number;         // 0 or 1
    costItems: number;
    assumptions: number;
    milestones: number;
    todos: number;
  };
  warnings: string[];
  importId: number;
} | {
  ok: false;
  error: string;
  warnings: string[];
};
