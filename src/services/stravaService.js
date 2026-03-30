/**
 * Strava integration — OAuth connect + activity sync.
 *
 * Uses EXPO_PUBLIC_STRAVA_CLIENT_ID and EXPO_PUBLIC_STRAVA_CLIENT_SECRET from .env
 *
 * Flow:
 *  1. User taps "Connect Strava" → opens OAuth browser
 *  2. User authorises → redirect back with code
 *  3. Exchange code for tokens → store in AsyncStorage
 *  4. Fetch recent activities → match against plan activities
 */
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { saveStravaTokens, getStravaTokens, clearStravaTokens } from './storageService';

const STRAVA_CLIENT_ID     = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID || '';
const STRAVA_CLIENT_SECRET = process.env.EXPO_PUBLIC_STRAVA_CLIENT_SECRET || '';
const REDIRECT_URI         = 'etapa://strava/callback';
const STRAVA_AUTH_URL       = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL      = 'https://www.strava.com/oauth/token';

export const isStravaConfigured = !!(STRAVA_CLIENT_ID && STRAVA_CLIENT_SECRET);

// ── Connect (OAuth) ──────────────────────────────────────────────────────────

export async function connectStrava() {
  if (!isStravaConfigured) {
    throw new Error('Strava credentials not configured. Add EXPO_PUBLIC_STRAVA_CLIENT_ID and EXPO_PUBLIC_STRAVA_CLIENT_SECRET to .env');
  }

  const authUrl = `${STRAVA_AUTH_URL}?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=read,activity:read_all&approval_prompt=auto`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

  if (result.type !== 'success') {
    throw new Error('Strava authorisation cancelled');
  }

  // Extract code from redirect URL
  const url = new URL(result.url);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('No authorisation code received from Strava');

  // Exchange code for tokens
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to exchange Strava code');
  }

  const tokens = await res.json();
  await saveStravaTokens({
    accessToken:  tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt:    tokens.expires_at,
    athleteId:    tokens.athlete?.id,
    athleteName:  tokens.athlete?.firstname,
  });

  return tokens;
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

  // Refresh
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    }),
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
