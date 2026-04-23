/**
 * /import — drag-drop Excel upload.
 *
 * Flow:
 *   1. User drops or picks a .xlsx file.
 *   2. We POST it as multipart/form-data to /api/finance/import-excel.
 *   3. Server parses + writes + returns a summary with per-table counts.
 *   4. Show either the counts (success) or the error message (failure).
 *
 * Deliberately no preview-before-commit step — the upload is idempotent
 * (delete + insert per table on the server), so "upload again to fix it"
 * is the correction path. Keeps the UI a single click.
 */
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ImportSummary } from "@/lib/finance/types";
import Nav from "@/components/Nav";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type Result = ImportSummary | null;

export default function ImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supa = getBrowserSupabase();
      const { data: { user } } = await supa.auth.getUser();
      setEmail(user?.email ?? null);
    })();
  }, []);

  async function uploadFile(file: File) {
    setUploading(true);
    setResult(null);
    setFilename(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/finance/import-excel", { method: "POST", body: form });
      const body: ImportSummary = await res.json();
      setResult(body);
    } catch (err: unknown) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Network error",
        warnings: [],
      });
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) uploadFile(f);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) uploadFile(f);
  }

  return (
    <>
      <Nav email={email} />
      <main className="p-6 md:p-10 max-w-3xl mx-auto">
      <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">← Home</Link>
      <h1 className="text-xl font-semibold mt-4 mb-2">Import Excel model</h1>
      <p className="text-sm text-zinc-400 mb-8">
        Drop your local copy of <code className="text-zinc-300">Etapa_Financial_Model.xlsx</code> here.
        The dashboard parses every sheet and replaces cost items, milestones, and todos with the fresh values.
        The file itself is never stored — only the parsed rows.
      </p>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition ${
          dragOver
            ? "border-brand bg-brand/5"
            : "border-zinc-700 bg-zinc-950 hover:border-zinc-600"
        } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
      >
        <p className="text-sm text-zinc-300 font-medium">
          {uploading ? "Uploading + parsing…" : "Drop the .xlsx here, or click to pick"}
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          {filename ? `Last picked: ${filename}` : "Accepts .xlsx up to 10 MB"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onPick}
          className="hidden"
        />
      </div>

      {/* Result panel */}
      {result && (
        <div className={`mt-6 rounded-xl p-5 border ${
          result.ok
            ? "border-emerald-900/50 bg-emerald-950/20"
            : "border-red-900/50 bg-red-950/20"
        }`}>
          {result.ok ? (
            <>
              <div className="text-sm font-semibold text-emerald-300 mb-3">Import complete</div>
              <ul className="text-xs text-zinc-300 space-y-1 font-mono">
                <li>Cost items:   <span className="text-emerald-200">{result.counts.costItems}</span></li>
                <li>Assumptions: <span className="text-emerald-200">{result.counts.assumptions}</span></li>
                <li>Milestones:  <span className="text-emerald-200">{result.counts.milestones}</span></li>
                <li>Todos:       <span className="text-emerald-200">{result.counts.todos}</span></li>
                <li>Cash snapshot: <span className="text-emerald-200">{result.counts.cashSnapshot}</span></li>
              </ul>
              {result.warnings.length > 0 && (
                <div className="mt-4 text-xs text-amber-300">
                  <p className="font-semibold mb-1">Warnings:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              <Link href="/" className="inline-block mt-4 text-xs bg-brand text-brand-fg rounded px-3 py-1.5 font-medium hover:opacity-90">
                View dashboard →
              </Link>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-red-300 mb-2">Import failed</div>
              <p className="text-xs text-zinc-300 font-mono break-all">{result.error}</p>
              {result.warnings.length > 0 && (
                <div className="mt-3 text-xs text-amber-300">
                  <p className="font-semibold mb-1">Warnings before the failure:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              <p className="text-xs text-zinc-500 mt-3">
                The upload is safe to retry — nothing partial was committed.
              </p>
            </>
          )}
        </div>
      )}

      <p className="text-xs text-zinc-600 mt-10">
        The Excel file itself is gitignored under <code>docs/budget-dashboard/*.xlsx</code> so it
        never leaves your machine unintentionally. The server reads the upload, parses it, and
        discards the bytes — only the normalised rows land in the database.
      </p>
      </main>
    </>
  );
}
