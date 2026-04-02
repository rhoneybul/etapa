"use client";

const colors: Record<string, string> = {
  // plans
  free: "bg-gray-800 text-gray-300",
  starter: "bg-blue-900/50 text-blue-400",
  pro: "bg-indigo-900/50 text-indigo-400",
  enterprise: "bg-purple-900/50 text-purple-400",
  // status
  active: "bg-green-900/30 text-green-400",
  trialing: "bg-amber-900/30 text-amber-400",
  inactive: "bg-gray-800 text-gray-400",
  suspended: "bg-red-900/30 text-red-400",
  draft: "bg-yellow-900/30 text-yellow-400",
  archived: "bg-gray-800 text-gray-400",
  paid: "bg-green-900/30 text-green-400",
  // payment status
  succeeded: "bg-green-900/30 text-green-400",
  pending: "bg-yellow-900/30 text-yellow-400",
  failed: "bg-red-900/30 text-red-400",
  refunded: "bg-orange-900/30 text-orange-400",
  canceled: "bg-gray-800 text-gray-400",
  // ticket status
  open: "bg-blue-900/30 text-blue-400",
  in_progress: "bg-yellow-900/30 text-yellow-400",
  resolved: "bg-green-900/30 text-green-400",
  closed: "bg-gray-800 text-gray-400",
  // priority
  urgent: "bg-red-900/30 text-red-400",
  high: "bg-orange-900/30 text-orange-400",
  medium: "bg-yellow-900/30 text-yellow-400",
  low: "bg-gray-800 text-gray-400",
  // feedback categories
  bug: "bg-red-900/30 text-red-400",
  feature: "bg-indigo-900/30 text-indigo-400",
  support: "bg-amber-900/30 text-amber-400",
  general: "bg-gray-800 text-gray-400",
};

export function Badge({ value }: { value: string }) {
  const colorClass = colors[value] || "bg-gray-800 text-gray-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {value.replace("_", " ")}
    </span>
  );
}
