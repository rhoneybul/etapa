"use client";

import { useEffect, useState } from "react";

interface Admin {
  id: string;
  email: string;
  name: string | null;
  grantedAt: string;
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchAdmins = () => {
    fetch("/api/admins")
      .then((r) => r.json())
      .then((data) => setAdmins(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const res = await fetch("/api/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to add admin");
      return;
    }

    setSuccess(`${data.email} granted admin access`);
    setEmail("");
    fetchAdmins();
  };

  const handleRemove = async (adminEmail: string) => {
    if (!confirm(`Revoke admin access for ${adminEmail}?`)) return;
    setError("");
    setSuccess("");

    const res = await fetch(`/api/admins?email=${encodeURIComponent(adminEmail)}`, {
      method: "DELETE",
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to revoke admin");
      return;
    }

    setSuccess(`${adminEmail} access revoked`);
    fetchAdmins();
  };

  if (loading) return <div className="animate-pulse text-gray-500">Loading admins...</div>;

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Admin Access</h1>
      <p className="text-sm text-gray-500 mb-6">
        Manage who can access this dashboard. Sets the <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">is_admin</code> flag on the user's Supabase profile. The user must already have an Etapa account.
      </p>

      {/* Add admin form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 max-w-lg">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Grant admin access</h2>
        <form onSubmit={handleAdd} className="flex gap-3">
          <input
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Grant Access
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-2 text-sm text-green-600">{success}</p>}
      </div>

      {/* Admin list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {admins.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">No admins found</td>
              </tr>
            ) : (
              admins.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{a.email}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRemove(a.email)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
