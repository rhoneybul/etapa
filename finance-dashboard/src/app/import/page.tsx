/**
 * /import — Excel upload flow.
 *
 * Phase 1 stub: explains the mechanic and hands off to a drag-drop that will
 * be implemented in Phase 2. The architectural choice is that the Excel
 * NEVER lives in git — it's uploaded here, parsed server-side by the
 * /api/finance/import-excel endpoint (Phase 2), and the DB takes over as
 * source of truth.
 */
"use client";

import Link from "next/link";

export default function ImportPage() {
  return (
    <main className="min-h-dvh p-6 md:p-10 max-w-3xl mx-auto">
      <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">← Home</Link>
      <h1 className="text-xl font-semibold mt-4 mb-2">Import Excel model</h1>
      <p className="text-sm text-zinc-400 mb-8">
        Drop your local copy of <code>Etapa_Financial_Model.xlsx</code> here. The dashboard parses
        every sheet, populates the database, and hands you back a preview before committing. The
        file itself is never stored — only the rows you approve.
      </p>

      <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center bg-zinc-950">
        <p className="text-sm text-zinc-400">
          Upload UI arrives in Phase 2.
        </p>
        <p className="text-xs text-zinc-600 mt-2">
          The parser + <code>POST /api/finance/import-excel</code> endpoint are the next ticket.
        </p>
      </div>

      <p className="text-xs text-zinc-600 mt-6">
        The Excel file itself is gitignored under <code>docs/budget-dashboard/*.xlsx</code> so it
        never leaves your machine unintentionally.
      </p>
    </main>
  );
}
