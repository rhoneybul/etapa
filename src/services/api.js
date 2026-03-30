/**
 * Etapa API client — talks to the Express server which persists to Supabase.
 *
 * In development:  calls http://localhost:3001
 * In production:   calls EXPO_PUBLIC_API_URL (set in .env)
 *
 * Every request automatically attaches the Supabase JWT so the
 * server can verify who's calling.
 */

import { getSession } from './authService';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

async function getToken() {
  try {
    const session = await getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

async function request(method, path, body) {
  const token = await getToken();
  if (!token) return null; // Not authenticated — skip API call

  const headers = { 'Content-Type': 'application/json' };
  headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return null;

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `API error ${res.status}`);
    return data;
  } catch (err) {
    console.warn(`API ${method} ${path} failed:`, err.message);
    return null; // Fail silently — local storage is the source of truth
  }
}

// ── API endpoints ────────────────────────────────────────────────────────────
export const api = {
  users: {
    me: () => request('GET', '/api/users/me'),
  },

  goals: {
    list:   ()       => request('GET', '/api/goals'),
    create: (goal)   => request('POST', '/api/goals', goal),
    delete: (id)     => request('DELETE', `/api/goals/${id}`),
  },

  plans: {
    list:   ()         => request('GET', '/api/plans'),
    create: (plan)     => request('POST', '/api/plans', plan),
    update: (id, plan) => request('PUT', `/api/plans/${id}`, plan),
    delete: (id)       => request('DELETE', `/api/plans/${id}`),
    updateActivity: (planId, actId, updates) =>
      request('PATCH', `/api/plans/${planId}/activities/${actId}`, updates),
  },
};

export default api;
