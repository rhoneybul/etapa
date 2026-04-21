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
    deleteAccount: () => request('DELETE', '/api/users/me'),
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

  planConfigs: {
    list:   ()             => request('GET', '/api/plan-configs'),
    create: (config)       => request('POST', '/api/plan-configs', config),
    update: (id, config)   => request('PUT', `/api/plan-configs/${id}`, config),
    delete: (id)           => request('DELETE', `/api/plan-configs/${id}`),
  },

  chatSessions: {
    list:   (planId)                    => request('GET', `/api/chat-sessions?planId=${planId}`),
    save:   (planId, weekNum, messages) => request('PUT', `/api/chat-sessions/${planId}/${weekNum || 0}`, { messages }),
    delete: (planId, weekNum)           => request('DELETE', `/api/chat-sessions/${planId}/${weekNum || 0}`),
  },

  feedback: {
    submit:   (feedback)    => request('POST', '/api/feedback', feedback),
    list:     ()            => request('GET', '/api/feedback'),
    messages: (feedbackId)  => request('GET', `/api/feedback/${feedbackId}/messages`),
    reply:    (feedbackId, payload) => request(
      'POST',
      `/api/feedback/${feedbackId}/messages`,
      // Accept either a string (legacy) or { message, attachments } (new)
      typeof payload === 'string' ? { message: payload } : payload
    ),
    attachmentUploadUrl: (payload) => request('POST', '/api/feedback/attachment-upload-url', payload),
  },

  notifications: {
    registerToken: (data) => request('POST', '/api/notifications/register-token', data),
    list:          ()     => request('GET', '/api/notifications'),
    markRead:      (id)   => request('PATCH', `/api/notifications/${id}/read`),
    markAllRead:   ()     => request('PATCH', '/api/notifications/read-all'),
    unreadCount:   ()     => request('GET', '/api/notifications/unread-count'),
  },

  preferences: {
    get:    ()     => request('GET', '/api/preferences'),
    update: (data) => request('PUT', '/api/preferences', data),
  },

  appConfig: {
    get: () => request('GET', '/api/app-config'),
  },
};

export default api;
