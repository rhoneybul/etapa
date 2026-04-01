"use client";

import { useEffect, useState } from "react";
import { Admin } from "@/types";

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchAdmins = () => {
    fetch("/api/admins")
      .then((r) => r.json())
      .then(setAdmins)
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
      body: JSON.stringify({ email, name }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to add admin");
      return;
    }

    setSuccess(`${name} added as admin`);
    setEmail("");
    setName("");
    fetchAdmins();
  };

  const handleRemove = async (adminEmail: string) => {
    if (!confirm(`Remove ${adminEmail} as admin?`)) return;
    setError("");
    setSuccess("");

    const res = await fetch(`/api/admins?email=${encodeURIComponent(adminEmail)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to remove admin");
      return;
    }

    setSuccess(`${adminEmail} removed`);
    fetchAdmins();
  };

  if (loading) return <div className="animate-pulse text-gray-500">Loading admins...</div>;

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Admin Access</h1>
      <p className="text-sm text-gray-500 mb-6">
        Manage who can access this dashboard. Only listed emails can sign in via Google OAuth.
      </p>

      {/* Add admin form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 max-w-lg">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Add new admin</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
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
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Granted</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {admins.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                <td className="px-4 py-3 text-gray-600">{a.email}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(a.grantedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleRemove(a.email)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
