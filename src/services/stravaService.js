/**
 * Strava integration — OAuth connect + activity sync.
 *
 * OAuth flow (server-assisted):
 *  1. User taps "Connect Strava" → opens Strava auth in browser
 *  2. Strava redirects to server callback (GET /api/strava/callback?code=...)
 *  3. Server exchanges code for tokens (keeps client_secret secure)
 *  4. Server redirects back to app via deep link with tokens
 *  5. App stores tokens in AsyncStorage
 *
 * Env vars:
 *   EXPO_PUBLIC_STRAVA_CLIENT_ID  — used to build the auth URL
 *   EXPO_PUBLIC_API_URL            — server base URL for the callback
 *   STRAVA_CLIENT_ID + STRAVA_CLIENT_SECRET — on the server only
 */
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { saveStravaTokens, getStravaTokens, clearStravaTokens } from './storageService';

const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID || '';
const SERVER_URL       = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
const STRAVA_AUTH_URL  = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const APP_REDIRECT_URI = 'etapa://strava/callback';

// The redirect URI points to the server, which exchanges the code and redirects
// back to the app. This is required because Strava doesn't allow custom URI schemes.
const SERVER_CALLBACK_URI = `${SERVER_URL}/api/strava/callback`;

export const isStravaConfigured = !!STRAVA_CLIENT_ID;

// ── Connect (OAuth) ──────────────────────────────────────────────────────────

export async function connectStrava() {
  if (!isStravaConfigured) {
    throw new Error('Strava credentials not configured. Add EXPO_PUBLIC_STRAVA_CLIENT_ID to .env');
  }

  const authUrl = `${STRAVA_AUTH_URL}?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(SERVER_CALLBACK_URI)}&scope=read,activity:read_all&approval_prompt=auto`;

  // openAuthSessionAsync intercepts the deep link redirect from the server
  const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_REDIRECT_URI);

  if (result.type !== 'success') {
    throw new Error('Strava authorisation cancelled');
  }

  // The server already exchanged the code — tokens come back as query params
  const url = new URL(result.url);
  const error = url.searchParams.get('error');
  if (error) throw new Error(`Strava auth failed: ${error}`);

  const accessToken  = url.searchParams.get('access_token');
  const refreshToken = url.searchParams.get('refresh_token');
  const expiresAt    = url.searchParams.get('expires_at');
  const athleteId    = url.searchParams.get('athlete_id');
  const athleteName  = url.searchParams.get('athlete_name');

  if (!accessToken) throw new Error('No access token received from Strava');

  await saveStravaTokens({
    accessToken,
    refreshToken,
    expiresAt: Number(expiresAt),
    athleteId: athleteId || null,
    athleteName: athleteName || null,
  });

  return { access_token: accessToken, athlete: { id: athleteId, firstname: athleteName } };
}

// ── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnectStrava() {
  await clearStravaTokens();
}

// ── Check connection ─────────────────────────────────────────────────────────

export async function isStravaConnected() {
  const tokens = await getStravaTokens();
  return !!tokens?.accessToken;
}

// ── Refresh token if expired ─────────────────────────────────────────────────

async function ensureFreshToken() {
  const tokens = await getStravaTokens();
  if (!tokens) throw new Error('Not connected to Strava');

  const now = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt && tokens.expiresAt > now + 60) {
    return tokens.accessToken;
  }

  // Refresh — this goes directly to Strava (refresh doesn't need redirect_uri)
  // We need the client_id for this, but the secret is handled server-side.
  // For token refresh we call our own server endpoint instead.
  const res = await fetch(`${SERVER_URL}/api/strava/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refreshToken }),
  });

  if (!res.ok) throw new Error('Failed to refresh Strava token');

  const data = await res.json();
  await saveStravaTokens({
    ...tokens,
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    data.expires_at,
  });

  return data.access_token;
}

// ── Fetch recent activities ──────────────────────────────────────────────────

export async function fetchRecentActivities(after = null) {
  const token = await ensureFreshToken();

  let url = 'https://www.strava.com/api/v3/athlete/activities?per_page=30';
  if (after) url += `&after=${Math.floor(new Date(after).getTime() / 1000)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error('Failed to fetch Strava activities');

  const activities = await res.json();

  // Filter to cycling activities only
  return activities
    .filter(a => a.type === 'Ride' || a.type === 'VirtualRide' || a.type === 'GravelRide' || a.type === 'MountainBikeRide')
    .map(a => ({
      stravaId:    a.id,
      name:        a.name,
      type:        a.type,
      distance:    a.distance,       // meters
      movingTime:  a.moving_time,    // seconds
      elapsedTime: a.elapsed_time,
      avgSpeed:    a.average_speed,  // m/s
      startDate:   a.start_date_local,
    }));
}

// ── Re-export tokens check for UI ────────────────────────────────────────────

export { getStravaTokens };
