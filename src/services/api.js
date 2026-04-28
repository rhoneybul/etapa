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

/**
 * Mint a one-shot signed URL for exporting an activity as a workout file.
 *
 * Two hops:
 *   1. POST to /api/plans/:planId/activities/:id/export-url with the
 *      user's Bearer token. The server validates ownership and returns
 *      a short-TTL HMAC-signed URL pointing at /api/exports/workout.
 *   2. The client opens that signed URL via Linking.openURL — the OS
 *      browser downloads the file. No auth header needed on the second
 *      request because the URL itself is the authority.
 *
 * Returns null on failure (signed-out, network error, server config).
 */
export async function buildWorkoutExportUrl(planId, activityId, format = 'zwo') {
  const fmt = String(format).toLowerCase();
  const path = `/api/plans/${encodeURIComponent(planId)}/activities/${encodeURIComponent(activityId)}/export-url`;
  const data = await request('POST', path, { format: fmt });
  return data?.url || null;
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
    // Current rolling usage + effective limits for the authed user.
    // Shape:
    //   { plans: { used, limit, remaining, resets_at, unlimited },
    //     coach_messages: { used, limit, remaining, resets_at, unlimited } }
    limits: () => request('GET', '/api/users/limits'),
  },

  goals: {
    list:   ()       => request('GET', '/api/goals'),
    create: (goal)   => request('POST', '/api/goals', goal),
    delete: (id)     => request('DELETE', `/api/goals/${id}`),
  },

  // Weekly check-ins.
  checkins: {
    pending:      ()                 => request('GET', '/api/checkins/pending'),
    list:         ()                 => request('GET', '/api/checkins'),
    respond:      (id, body)         => request('POST', `/api/checkins/${id}/respond`, body),
    dismiss:      (id)               => request('POST', `/api/checkins/${id}/dismiss`),
    physioNotes:  (id, body)         => request('POST', `/api/checkins/${id}/physio-notes`, body),
  },
  // Per-user check-in schedule (day, time, timezone, enabled).
  checkinPrefs: {
    get:    () => request('GET', '/api/checkin-prefs'),
    save:   (prefs) => request('POST', '/api/checkin-prefs', prefs),
  },

  plans: {
    list:   ()         => request('GET', '/api/plans'),
    create: (plan)     => request('POST', '/api/plans', plan),
    update: (id, plan) => request('PUT', `/api/plans/${id}`, plan),
    delete: (id)       => request('DELETE', `/api/plans/${id}`),
    updateActivity: (planId, actId, updates) =>
      request('PATCH', `/api/plans/${planId}/activities/${actId}`, updates),
    // Regenerate — takes an automatic pre-regenerate snapshot, then kicks
    // off async generation. Returns { jobId, snapshotId } — the client polls
    // the normal /api/ai/plan-job/:jobId endpoint as for a fresh generate.
    regenerate: (planId, { goal, config }) =>
      request('POST', `/api/plans/${planId}/regenerate`, { goal, config }),
    // Version history
    versions: {
      list:   (planId) => request('GET', `/api/plans/${planId}/versions`),
      revert: (planId, snapshotId) =>
        request('POST', `/api/plans/${planId}/versions/${snapshotId}/revert`),
      delete: (planId, snapshotId) =>
        request('DELETE', `/api/plans/${planId}/versions/${snapshotId}`),
    },
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
    markAllRead:   (type) => request('PATCH', `/api/notifications/read-all${type ? `?type=${encodeURIComponent(type)}` : ''}`),
    testPush:      ()     => request('POST', '/api/notifications/test'),
    // Optional `type` (e.g. 'coach_reply') and `excludeScope` (e.g.
    // 'session') filters. Home screen passes excludeScope='session' so
    // coach replies from a session-scoped chat don't bump the coach chip.
    unreadCount:   (type, opts = {}) => {
      const qs = [];
      if (type) qs.push(`type=${encodeURIComponent(type)}`);
      if (opts?.excludeScope) qs.push(`excludeScope=${encodeURIComponent(opts.excludeScope)}`);
      return request('GET', `/api/notifications/unread-count${qs.length ? `?${qs.join('&')}` : ''}`);
    },
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
