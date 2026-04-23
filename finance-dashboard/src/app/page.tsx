/**
 * Phase 1 home page — deliberately empty. Shows "who am I signed in as" +
 * whether the Excel import has happened. The real dashboard (KPIs, runway
 * gauge, burn chart) arrives in Phase 4 once the data layer is in.
 *
 * The check for "has the DB been seeded" is deliberately cheap: just ask
 * the finance.imports table whether any row exists. If not, nudge the user
 * to /import to upload their Excel model.
 */
import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  // Has anyone imported the Excel yet? Count rows in finance.imports.
  // RLS keeps this query honest — a non-allowlisted session would error.
  const { count: importCount } = await supabase
    .schema("finance")
    .from("imports")
    .select("*", { head: true, count: "exact" });

  const seeded = (importCount ?? 0) > 0;

  return (
    <main className="min-h-dvh p-6 md:p-10 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold">Etapa Finance</h1>
          <p className="text-sm text-zinc-400">Signed in as {user?.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded px-3 py-1.5">
            Sign out
          </button>
        </form>
      </header>

      {!seeded ? (
        <section className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-6">
          <h2 className="text-base font-semibold text-amber-300 mb-2">Set up the dashboard</h2>
          <p className="text-sm text-zinc-300 mb-4 max-w-2xl">
            The database is empty. Upload your <code>Etapa_Financial_Model.xlsx</code> on the import page
            to seed assumptions, cost items, milestones, and todos in one go. The Excel file stays on your
            machine — the dashboard doesn&apos;t store it, only the parsed data.
          </p>
          <Link
            href="/import"
            className="inline-block bg-brand text-brand-fg text-sm font-medium rounded-lg px-4 py-2 hover:opacity-90"
          >
            Upload Excel →
          </Link>
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-base font-semibold mb-2">Dashboard</h2>
          <p className="text-sm text-zinc-400">
            Phase 1 plumbing is live. KPI tiles, runway gauge, and burn breakdown land in Phase 4.
          </p>
          <p className="text-xs text-zinc-500 mt-4">
            Last Excel import: {importCount} {importCount === 1 ? "upload" : "uploads"} recorded.
          </p>
        </section>
      )}

      <footer className="mt-12 text-xs text-zinc-600 flex gap-4">
        <Link href="/import" className="hover:text-zinc-300">Import Excel</Link>
        <span className="text-zinc-800">·</span>
        <a
          href="https://github.com/rhoneybul/etapa/blob/main/docs/budget-dashboard/ETAPA_DASHBOARD_SPEC.md"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-zinc-300"
        >
          Spec
        </a>
      </footer>
    </main>
  );
}
