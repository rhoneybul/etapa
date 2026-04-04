/**
 * Strava OAuth callback — server-side token exchange.
 *
 * Flow:
 *  1. Mobile app opens Strava auth with redirect_uri pointing here
 *  2. Strava redirects user to GET /api/strava/callback?code=...
 *  3. Server exchanges code for tokens
 *  4. Server redirects back to the app via deep link with tokens
 *
 * This avoids exposing the client secret in the mobile app and works
 * around Strava's restriction on custom URI scheme redirect URIs.
 *
 * Env vars required:
 *   STRAVA_CLIENT_ID
 *   STRAVA_CLIENT_SECRET
 */
const { Router } = require('express');
const router = Router();

const STRAVA_CLIENT_ID     = process.env.STRAVA_CLIENT_ID || '';
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET || '';
const STRAVA_TOKEN_URL     = 'https://www.strava.com/oauth/token';
const APP_SCHEME           = 'etapa';

// GET /api/strava/callback?code=...&scope=...
// No auth middleware — Strava redirects the browser here directly.
router.get('/callback', async (req, res) => {
  const { code, error: stravaError } = req.query;

  if (stravaError || !code) {
    // User denied or something went wrong — redirect back to app with error
    return res.redirect(`${APP_SCHEME}://strava/callback?error=${encodeURIComponent(stravaError || 'no_code')}`);
  }

  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    return res.redirect(`${APP_SCHEME}://strava/callback?error=server_not_configured`);
  }

  try {
    // Exchange the authorisation code for tokens
    const tokenRes = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      console.error('[strava] Token exchange failed:', err);
      return res.redirect(`${APP_SCHEME}://strava/callback?error=token_exchange_failed`);
    }

    const tokens = await tokenRes.json();

    // Redirect back to the app with token data as query params
    const params = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: String(tokens.expires_at),
      athlete_id: String(tokens.athlete?.id || ''),
      athlete_name: tokens.athlete?.firstname || '',
    });

    res.redirect(`${APP_SCHEME}://strava/callback?${params.toString()}`);
  } catch (err) {
    console.error('[strava] Callback error:', err);
    res.redirect(`${APP_SCHEME}://strava/callback?error=server_error`);
  }
});

// POST /api/strava/refresh — refresh an expired access token
// Body: { refresh_token }
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body || {};

  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token is required' });
  }

  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Strava not configured on server' });
  }

  try {
    const tokenRes = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      console.error('[strava] Token refresh failed:', err);
      return res.status(tokenRes.status).json({ error: 'Token refresh failed' });
    }

    const data = await tokenRes.json();
    res.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    });
  } catch (err) {
    console.error('[strava] Refresh error:', err);
    res.status(500).json({ error: 'Server error during token refresh' });
  }
});

module.exports = router;
