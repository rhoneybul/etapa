"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

interface Profile {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  provider: string | null;
  providers: string[];
}

interface Subscription {
  id: string;
  plan: string;
  status: string;
  source: string;
  store: string | null;
  productId: string | null;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface Plan {
  id: string;
  name: string;
  status: string;
  weeks: number | null;
  startDate: string | null;
  createdAt: string;
  activityCount: number;
}

interface Feedback {
  id: string;
  category: string;
  message: string;
  appVersion: string | null;
  linearIssueKey: string | null;
  linearIssueUrl: string | null;
  adminResponse: string | null;
  adminRespondedAt: string | null;
  createdAt: string;
}

interface Ticket {
  id: string;
  linearId: string;
  title: string;
  url: string;
  priority: string;
  status: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

interface UserDetail {
  profile: Profile;
  subscriptions: Subscription[];
  plans: Plan[];
  feedback: Feedback[];
  tickets: Ticket[];
}

interface RCTransaction {
  kind: "one_time" | "subscription";
  productId: string;
  transactionId: string | null;
  store: string | null;
  isSandbox: boolean;
  purchaseDate: string | null;
  originalPurchaseDate?: string | null;
  expiresDate: string | null;
  periodType: string | null;
  refundedAt: string | null;
  billingIssueAt: string | null;
  unsubscribeDetectedAt: string | null;
  ownershipType: string | null;
}

interface RevenueCatData {
  found: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
  originalAppUserId: string | null;
  originalPurchaseDate: string | null;
  managementUrl: string | null;
  transactions: RCTransaction[];
  error?: string;
}

const SOURCE_STYLES: Record<string, string> = {
  "Apple IAP": "bg-blue-900/30 text-blue-300 border-blue-700/30",
  "Google Play": "bg-green-900/30 text-green-300 border-green-700/30",
  "Coupon": "bg-purple-900/30 text-purple-300 border-purple-700/30",
  "Free Trial": "bg-amber-900/30 text-amber-300 border-amber-700/30",
  "Stripe": "bg-indigo-900/30 text-indigo-300 border-indigo-700/30",
  "Promotional": "bg-pink-900/30 text-pink-300 border-pink-700/30",
};

function formatDate(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h2>
        {typeof count === "number" && (
          <span className="text-xs text-etapa-textMuted">({count})</span>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="bg-etapa-surface rounded-xl border border-etapa-border p-6 text-center text-sm text-etapa-textFaint">
      {text}
    </div>
  );
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rcData, setRcData] = useState<RevenueCatData | null>(null);
  const [rcLoading, setRcLoading] = useState(true);
  const [rcError, setRcError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    setLoading(true);
    fetch(`/api/users/${params.id}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${r.status})`);
        }
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    setRcLoading(true);
    fetch(`/api/users/${params.id}/revenuecat`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `RevenueCat request failed (${r.status})`);
        return body as RevenueCatData;
      })
      .then((d) => setRcData(d))
      .catch((e) => setRcError(e.message))
      .finally(() => setRcLoading(false));
  }, [params?.id]);

  if (loading) {
    return <div className="animate-pulse text-etapa-textMuted">Loading user...</div>;
  }

  if (error || !data) {
    return (
      <div>
        <Link href="/dashboard/users" className="text-xs text-etapa-textMuted hover:text-white">
          &larr; Back to Users
        </Link>
        <div className="mt-6 bg-red-900/20 border border-red-900/40 rounded-xl p-6 text-sm text-red-400">
          {error || "User not found"}
        </div>
      </div>
    );
  }

  const { profile, subscriptions, plans, feedback, tickets } = data;
  const displayName = profile.name || profile.email || profile.id;
  const activeSub = subscriptions.find((s) => ["active", "trialing", "paid"].includes(s.status));

  return (
    <div>
      <Link href="/dashboard/users" className="text-xs text-etapa-textMuted hover:text-white">
        &larr; Back to Users
      </Link>

      {/* Header */}
      <div className="mt-3 mb-6 flex items-center gap-4">
        <div className="w-12 h-12 bg-etapa-primary/20 rounded-full flex items-center justify-center text-lg font-medium text-etapa-primary">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-white truncate">{displayName}</h1>
            {profile.isAdmin && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-etapa-primary/15 text-etapa-primary border border-etapa-primary/20">
                ADMIN
              </span>
            )}
          </div>
          <p className="text-sm text-etapa-textMuted">{profile.email}</p>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Current Plan"
          value={activeSub?.plan || "free"}
          sub={activeSub?.status || "\u2014"}
        />
        <StatCard label="Training Plans" value={plans.length} />
        <StatCard label="Feedback" value={feedback.length} />
        <StatCard label="Support Tickets" value={tickets.length} />
      </div>

      {/* Profile & account */}
      <Section title="Profile & Account">
        <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
          <dl className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-etapa-border">
            <div className="p-4 space-y-3">
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">User ID</dt>
                <dd className="text-xs font-mono text-etapa-textMid mt-1 break-all">{profile.id}</dd>
              </div>
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Email</dt>
                <dd className="text-sm text-white mt-1">{profile.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Name</dt>
                <dd className="text-sm text-white mt-1">{profile.name || "\u2014"}</dd>
              </div>
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Auth Provider</dt>
                <dd className="text-sm text-white mt-1">
                  {profile.providers.length > 0 ? profile.providers.join(", ") : profile.provider || "\u2014"}
                </dd>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Signed Up</dt>
                <dd className="text-sm text-white mt-1">{formatDateTime(profile.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Last Sign In</dt>
                <dd className="text-sm text-white mt-1">{formatDateTime(profile.lastSignInAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Email Confirmed</dt>
                <dd className="text-sm text-white mt-1">{formatDateTime(profile.emailConfirmedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Admin</dt>
                <dd className="text-sm text-white mt-1">{profile.isAdmin ? "Yes" : "No"}</dd>
              </div>
            </div>
          </dl>
        </div>
      </Section>

      {/* Subscriptions */}
      <Section title="Subscriptions & Payments" count={subscriptions.length}>
        {subscriptions.length === 0 ? (
          <EmptyRow text="No subscription records for this user." />
        ) : (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-etapa-border bg-etapa-surfaceLight text-left">
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Plan</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Source</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Product</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Period End</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-etapa-border">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-etapa-surfaceLight transition-colors">
                      <td className="px-4 py-3"><Badge value={sub.plan} /></td>
                      <td className="px-4 py-3"><Badge value={sub.status} /></td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            SOURCE_STYLES[sub.source] || "bg-gray-800 text-gray-400 border-gray-700"
                          }`}
                        >
                          {sub.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid font-mono">
                        {sub.productId || "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid whitespace-nowrap">{formatDateTime(sub.currentPeriodEnd)}</td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid whitespace-nowrap">{formatDateTime(sub.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* RevenueCat transaction history */}
      <Section
        title="Transaction History (RevenueCat)"
        count={rcData?.transactions.length ?? undefined}
      >
        {rcLoading ? (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border p-6 text-sm text-etapa-textMuted animate-pulse">
            Loading live transaction data from RevenueCat...
          </div>
        ) : rcError ? (
          <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-4 text-sm text-red-400">
            {rcError}
          </div>
        ) : !rcData || !rcData.found ? (
          <EmptyRow text="No RevenueCat record for this user. They may have never made a purchase via IAP, or the RC secret API key isn't configured on the server." />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <StatCard label="First Seen" value={formatDate(rcData.firstSeen)} />
              <StatCard label="Last Seen" value={formatDate(rcData.lastSeen)} />
              <StatCard
                label="First Purchase"
                value={formatDate(rcData.originalPurchaseDate)}
              />
              <StatCard label="Transactions" value={rcData.transactions.length} />
            </div>

            {rcData.transactions.length === 0 ? (
              <EmptyRow text="No purchase transactions recorded in RevenueCat." />
            ) : (
              <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-etapa-border bg-etapa-surfaceLight text-left">
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Kind</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Product</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Store</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Env</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Purchase Time</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Expires</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Flags</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Transaction ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-etapa-border">
                      {rcData.transactions.map((t, i) => (
                        <tr key={`${t.transactionId || t.productId}-${i}`} className="hover:bg-etapa-surfaceLight transition-colors">
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                t.kind === "subscription"
                                  ? "bg-indigo-900/30 text-indigo-300"
                                  : "bg-purple-900/30 text-purple-300"
                              }`}
                            >
                              {t.kind === "subscription" ? "subscription" : "one-time"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-etapa-textMid font-mono">{t.productId}</td>
                          <td className="px-4 py-3 text-xs text-etapa-textMid">{t.store || "\u2014"}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                t.isSandbox
                                  ? "bg-amber-900/30 text-amber-400"
                                  : "bg-green-900/30 text-green-400"
                              }`}
                            >
                              {t.isSandbox ? "sandbox" : "production"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-etapa-textMid whitespace-nowrap">
                            {formatDateTime(t.purchaseDate)}
                          </td>
                          <td className="px-4 py-3 text-xs text-etapa-textMid whitespace-nowrap">
                            {t.expiresDate ? formatDateTime(t.expiresDate) : "\u2014"}
                          </td>
                          <td className="px-4 py-3 space-x-1">
                            {t.refundedAt && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-900/30 text-orange-400">
                                refunded
                              </span>
                            )}
                            {t.billingIssueAt && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-900/30 text-red-400">
                                billing issue
                              </span>
                            )}
                            {t.unsubscribeDetectedAt && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-300">
                                unsubscribed
                              </span>
                            )}
                            {t.periodType && t.periodType !== "normal" && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-900/30 text-blue-300">
                                {t.periodType}
                              </span>
                            )}
                            {!t.refundedAt && !t.billingIssueAt && !t.unsubscribeDetectedAt && (!t.periodType || t.periodType === "normal") && (
                              <span className="text-xs text-etapa-textFaint">{"\u2014"}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-etapa-textFaint break-all">
                            {t.transactionId || "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {rcData.managementUrl && (
              <p className="mt-2 text-xs text-etapa-textFaint">
                Store management URL:{" "}
                <a
                  href={rcData.managementUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-etapa-primary hover:text-amber-400"
                >
                  {rcData.managementUrl}
                </a>
              </p>
            )}
          </>
        )}
      </Section>

      {/* Plans & activities */}
      <Section title="Plans & Activities" count={plans.length}>
        {plans.length === 0 ? (
          <EmptyRow text="No training plans yet." />
        ) : (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-etapa-border bg-etapa-surfaceLight text-left">
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Plan</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Weeks</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Activities</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Start Date</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-etapa-border">
                  {plans.map((p) => (
                    <tr key={p.id} className="hover:bg-etapa-surfaceLight transition-colors">
                      <td className="px-4 py-3 text-white">{p.name || "\u2014"}</td>
                      <td className="px-4 py-3"><Badge value={p.status} /></td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid">{p.weeks ?? "\u2014"}</td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid">{p.activityCount}</td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid">{formatDate(p.startDate)}</td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid">{formatDate(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* Support & feedback */}
      <Section title="Support & Feedback" count={feedback.length + tickets.length}>
        <div className="space-y-6">
          <div>
            <p className="text-xs font-medium text-etapa-textMuted uppercase tracking-wide mb-2">
              Feedback ({feedback.length})
            </p>
            {feedback.length === 0 ? (
              <EmptyRow text="No feedback submitted." />
            ) : (
              <div className="space-y-3">
                {feedback.map((f) => (
                  <div
                    key={f.id}
                    className="bg-etapa-surface rounded-xl border border-etapa-border p-4"
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge value={f.category} />
                      <span className="text-xs text-etapa-textMuted">{formatDate(f.createdAt)}</span>
                      {f.appVersion && (
                        <span className="text-xs text-etapa-textFaint">v{f.appVersion}</span>
                      )}
                      {f.linearIssueUrl && (
                        <a
                          href={f.linearIssueUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto text-xs text-etapa-primary hover:text-amber-400"
                        >
                          {f.linearIssueKey || "View in Linear"} &rarr;
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-etapa-textMid whitespace-pre-wrap">{f.message}</p>
                    {f.adminResponse && (
                      <div className="mt-3 pt-3 border-t border-etapa-border">
                        <p className="text-xs text-etapa-textMuted mb-1">
                          Admin response &middot; {formatDate(f.adminRespondedAt)}
                        </p>
                        <p className="text-sm text-etapa-textMid whitespace-pre-wrap">
                          {f.adminResponse}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-etapa-textMuted uppercase tracking-wide mb-2">
              Linear Support Tickets ({tickets.length})
            </p>
            {tickets.length === 0 ? (
              <EmptyRow text="No Linear tickets referencing this user." />
            ) : (
              <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-etapa-border bg-etapa-surfaceLight text-left">
                      <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">ID</th>
                      <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Title</th>
                      <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Priority</th>
                      <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-etapa-border">
                    {tickets.map((t) => (
                      <tr key={t.id} className="hover:bg-etapa-surfaceLight transition-colors">
                        <td className="px-4 py-3">
                          <a
                            href={t.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-mono text-etapa-primary hover:text-amber-400"
                          >
                            {t.linearId}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-sm text-white">{t.title}</td>
                        <td className="px-4 py-3"><Badge value={t.priority} /></td>
                        <td className="px-4 py-3"><Badge value={t.status} /></td>
                        <td className="px-4 py-3 text-xs text-etapa-textMid">{formatDate(t.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
