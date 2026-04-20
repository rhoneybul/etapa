"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

interface VariantStats {
  views: number;
  clicks: number;
  responses: number;
  ctaClicks: number;
  signups: number;
  conversionRate: string;
  engagementRate: string;
}

interface DemoStats {
  summary: {
    totalEvents: number;
    uniqueSessions: number;
    viewsAllTime: number;
    promptClicksAllTime: number;
    responsesAllTime: number;
    ctaClicksAllTime: number;
    signupsAllTime: number;
  };
  last24h: {
    events: number;
    uniqueSessions: number;
    views: number;
    promptClicks: number;
    signups: number;
  };
  last7d: {
    events: number;
    uniqueSessions: number;
    views: number;
    promptClicks: number;
    signups: number;
  };
  last30d: {
    events: number;
    uniqueSessions: number;
    views: number;
    promptClicks: number;
    signups: number;
  };
  promptPopularity: { prompt: string; clicks: number }[];
  variants: { A: VariantStats; B: VariantStats };
}

const PROMPT_LABELS: Record<string, string> = {
  "generate-plan": "🚴 Build me a 3-week plan",
  "coach-adapt": "💭 I missed Monday's ride",
  "coach-volume": "🤔 Is 5 rides too much?",
  "review-plan": "🔍 Review this plan",
  "coach-bike": "🛒 What bike should I buy?",
  "coach-habit": "🌱 Help me build a habit",
};

export default function DemoStatsPage() {
  const [stats, setStats] = useState<DemoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/demo-stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setStats(data);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="animate-pulse text-etapa-textMuted">Loading demo analytics…</div>;
  }
  if (error || !stats) {
    return <div className="text-red-400">{error || "No data"}</div>;
  }

  const winner =
    stats.variants.A.views >= 10 && stats.variants.B.views >= 10
      ? stats.variants.A.signups > stats.variants.B.signups
        ? "A"
        : stats.variants.B.signups > stats.variants.A.signups
        ? "B"
        : "tied"
      : "not enough data";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Demo Analytics</h1>
        <p className="text-sm text-etapa-textMuted mt-1">
          Traffic through the interactive MCP demo on <code className="text-xs bg-etapa-surfaceLight px-1 py-0.5 rounded">getetapa.com/#mcp</code>.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Sessions" value={stats.summary.uniqueSessions} sub="All time" />
        <StatCard label="Prompt clicks" value={stats.summary.promptClicksAllTime} sub={`${stats.summary.responsesAllTime} responses`} />
        <StatCard label="CTA clicks" value={stats.summary.ctaClicksAllTime} sub={`${stats.summary.signupsAllTime} signups`} />
        <StatCard label="Conversion" value={
          stats.summary.viewsAllTime > 0
            ? `${(stats.summary.signupsAllTime / stats.summary.viewsAllTime * 100).toFixed(1)}%`
            : "—"
        } sub="Signup / view" />
      </div>

      {/* Recent windows */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <WindowCard title="Last 24 hours" data={stats.last24h} />
        <WindowCard title="Last 7 days"   data={stats.last7d}  />
        <WindowCard title="Last 30 days"  data={stats.last30d} />
      </div>

      {/* A/B variant performance */}
      <div className="bg-etapa-surface rounded-xl border border-etapa-border p-5 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium text-white">A/B test — CTA variant</h2>
            <p className="text-xs text-etapa-textMuted mt-1">
              Winner so far: <span className="text-white font-medium">{winner}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <VariantPanel label="Variant A" copy="This is a 30-second preview…" stats={stats.variants.A} />
          <VariantPanel label="Variant B" copy="Liked that? Imagine it remembering every ride…" stats={stats.variants.B} />
        </div>
      </div>

      {/* Prompt popularity */}
      <div className="bg-etapa-surface rounded-xl border border-etapa-border p-5">
        <h2 className="text-sm font-medium text-white mb-4">Prompt popularity</h2>
        {stats.promptPopularity.length === 0 ? (
          <p className="text-sm text-etapa-textFaint">No prompt clicks yet.</p>
        ) : (
          <div className="space-y-2">
            {stats.promptPopularity.map(({ prompt, clicks }) => {
              const maxClicks = stats.promptPopularity[0].clicks;
              const widthPct = maxClicks > 0 ? (clicks / maxClicks) * 100 : 0;
              return (
                <div key={prompt}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-etapa-textMid">{PROMPT_LABELS[prompt] || prompt}</span>
                    <span className="text-white font-medium">{clicks}</span>
                  </div>
                  <div className="h-2 rounded-full bg-etapa-surfaceLight overflow-hidden">
                    <div
                      className="h-full bg-etapa-primary rounded-full transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
      <p className="text-xs text-etapa-textMuted uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-semibold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-etapa-textFaint mt-1">{sub}</p>}
    </div>
  );
}

function WindowCard({ title, data }: { title: string; data: { events: number; uniqueSessions: number; views: number; promptClicks: number; signups: number } }) {
  return (
    <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
      <h3 className="text-xs font-medium text-etapa-textMuted uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-1.5 text-sm">
        <Row label="Sessions" value={data.uniqueSessions} />
        <Row label="Views" value={data.views} />
        <Row label="Prompt clicks" value={data.promptClicks} />
        <Row label="Signups" value={data.signups} highlight />
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-etapa-textMid">{label}</span>
      <span className={highlight ? "text-etapa-primary font-semibold" : "text-white"}>{value}</span>
    </div>
  );
}

function VariantPanel({ label, copy, stats }: { label: string; copy: string; stats: VariantStats }) {
  return (
    <div className="bg-etapa-surfaceLight border border-etapa-border rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="text-xs text-etapa-textMuted">{stats.views} views</span>
      </div>
      <p className="text-xs text-etapa-textMuted italic mb-3 line-clamp-2">&ldquo;{copy}&rdquo;</p>
      <div className="space-y-1 text-xs">
        <Row label="Prompt clicks" value={stats.clicks} />
        <Row label="CTA clicks" value={stats.ctaClicks} />
        <Row label="Signups" value={stats.signups} highlight />
        <div className="pt-2 mt-2 border-t border-etapa-border flex justify-between">
          <span className="text-etapa-textMid">Conversion</span>
          <span className="text-etapa-primary font-semibold">{stats.conversionRate}</span>
        </div>
      </div>
    </div>
  );
}
