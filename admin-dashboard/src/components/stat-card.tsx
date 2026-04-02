"use client";

export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-etapa-surface rounded-xl border border-etapa-border p-5">
      <p className="text-xs font-medium text-etapa-textMuted uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-etapa-textMuted">{sub}</p>}
    </div>
  );
}
