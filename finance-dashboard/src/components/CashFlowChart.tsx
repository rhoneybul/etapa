/**
 * CashFlowChart — 12-month forward cash projection with event markers.
 *
 * Rendered client-side (Recharts is client-only). Takes the pre-computed
 * ProjectionPoint[] from lib/finance/projection.ts so the same maths
 * powers this chart AND the KPI numbers — no divergence.
 *
 * Markers:
 *   - Override month (month 1 if any cost item carries next_month_override)
 *   - Runway-depleted month (first month balance hits 0)
 * Both render as ReferenceDots with a tooltip on hover.
 */
"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot } from "recharts";
import type { ProjectionPoint } from "@/lib/finance/projection";

export default function CashFlowChart({ points }: { points: ProjectionPoint[] }) {
  if (points.length === 0) return null;

  // Find event points so we can render coloured markers on top.
  const overridePoints = points.filter((p) => p.events.some((e) => e.kind === "override"));
  const depletedPoints = points.filter((p) => p.events.some((e) => e.kind === "runway_depleted"));

  return (
    <div className="h-72 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="#262629" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            stroke="#6b7280"
            tick={{ fontSize: 11 }}
            axisLine={{ stroke: "#27272a" }}
            tickLine={false}
          />
          <YAxis
            stroke="#6b7280"
            tick={{ fontSize: 11 }}
            axisLine={{ stroke: "#27272a" }}
            tickLine={false}
            tickFormatter={(v) => `£${Math.round(v / 100) / 10}k`}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: "#0b0b10",
              border: "1px solid #27272a",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#e4e4ef" }}
            formatter={(value: number, key: string) => {
              if (key === "balance") return [`£${Math.round(value).toLocaleString()}`, "Cash"];
              if (key === "burn") return [`£${Math.round(value).toLocaleString()}`, "Burn"];
              return [value, key];
            }}
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null;
              const p = payload[0].payload as ProjectionPoint;
              return (
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs">
                  <div className="text-zinc-200 font-medium mb-1">{label}</div>
                  <div className="text-zinc-400">Cash: <span className="text-zinc-100">£{Math.round(p.balance).toLocaleString()}</span></div>
                  {p.burn > 0 && <div className="text-zinc-400">Burn this month: £{Math.round(p.burn).toLocaleString()}</div>}
                  {p.events.map((e, i) => (
                    <div key={i} className={`mt-1 ${e.kind === "runway_depleted" ? "text-red-300" : "text-amber-300"}`}>
                      ⚑ {e.label}
                      {e.detail && <div className="text-zinc-500 font-normal">{e.detail}</div>}
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="#E8458B"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "#E8458B", fill: "#0b0b10" }}
          />
          {/* Override month — amber triangle */}
          {overridePoints.map((p) => (
            <ReferenceDot
              key={`ov-${p.month}`}
              x={p.label}
              y={p.balance}
              r={6}
              fill="#f59e0b"
              stroke="#0b0b10"
              strokeWidth={2}
            />
          ))}
          {/* Runway depleted — red dot on the month cash hits zero */}
          {depletedPoints.map((p) => (
            <ReferenceDot
              key={`dep-${p.month}`}
              x={p.label}
              y={p.balance}
              r={6}
              fill="#ef4444"
              stroke="#0b0b10"
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex gap-4 text-xs text-zinc-500 mt-2 pl-6">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-brand inline-block" /> Cash projection</span>
        {overridePoints.length > 0 && (
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-amber-500 rounded-full inline-block" /> Flagged month</span>
        )}
        {depletedPoints.length > 0 && (
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-red-500 rounded-full inline-block" /> Runway runs out</span>
        )}
      </div>
    </div>
  );
}
