"use client";

import { useState } from "react";

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  /** Hide this column in the mobile card view */
  hideOnMobile?: boolean;
  /** Show this column as the primary title in mobile card view */
  mobileTitle?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchKey?: string;
  searchPlaceholder?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Search...",
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");

  const filtered = searchKey
    ? data.filter((row) =>
        String(row[searchKey]).toLowerCase().includes(search.toLowerCase())
      )
    : data;

  return (
    <div>
      {searchKey && (
        <div className="mb-4">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:max-w-xs px-3 py-2 bg-etapa-surface border border-etapa-border rounded-lg text-sm text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary focus:border-transparent"
          />
        </div>
      )}

      {/* Desktop table view */}
      <div className="hidden md:block bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-etapa-border bg-etapa-surfaceLight">
                {columns.map((col) => (
                  <th key={col.key} className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-etapa-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-etapa-textFaint">
                    No results found
                  </td>
                </tr>
              ) : (
                filtered.map((row, i) => (
                  <tr key={i} className="hover:bg-etapa-surfaceLight transition-colors">
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-etapa-textMid">
                        {col.render ? col.render(row) : String(row[col.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border p-6 text-center text-etapa-textFaint text-sm">
            No results found
          </div>
        ) : (
          filtered.map((row, i) => (
            <div key={i} className="bg-etapa-surface rounded-xl border border-etapa-border p-4 space-y-2.5">
              {columns.map((col) => {
                if (!col.label && !col.render) return null; // skip empty action columns without content
                const content = col.render ? col.render(row) : String(row[col.key] ?? "");
                if (!col.label) {
                  // Action column — render at the bottom
                  return (
                    <div key={col.key} className="pt-2 border-t border-etapa-border">
                      {content}
                    </div>
                  );
                }
                return (
                  <div key={col.key} className="flex items-start justify-between gap-3">
                    <span className="text-xs text-etapa-textMuted uppercase tracking-wide shrink-0 pt-0.5 min-w-[80px]">
                      {col.label}
                    </span>
                    <div className="text-sm text-right">{content}</div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <p className="mt-2 text-xs text-etapa-textFaint">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>
    </div>
  );
}
