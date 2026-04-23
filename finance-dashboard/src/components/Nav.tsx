/**
 * Top navigation — shared across every authenticated page.
 * Renders the email + sign-out button on the right, tabs on the left.
 * Kept server-component-friendly (no hooks) so it can live in layouts.
 */
import Link from "next/link";

const TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/todos", label: "Todos" },
  { href: "/milestones", label: "Milestones" },
  { href: "/costs", label: "Costs" },
  { href: "/budgets", label: "Budgets" },
  { href: "/transactions", label: "Transactions" },
  { href: "/settings", label: "Settings" },
  { href: "/import", label: "Import" },
];

export default function Nav({ email }: { email?: string | null }) {
  return (
    <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 h-12 flex items-center gap-6 text-sm">
        <span className="font-semibold text-white">Etapa Finance</span>
        <div className="flex gap-4 text-zinc-400">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="hover:text-zinc-100 transition-colors">
              {t.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          {email ? <span>{email}</span> : null}
          <form action="/auth/signout" method="post">
            <button className="text-zinc-400 hover:text-white border border-zinc-800 rounded px-2 py-1">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
