/**
 * Supabase auth for the app (mobile + web) — Google-only.
 *
 * Uses EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from .env
 * Falls back gracefully to guest mode if keys are not set.
 */
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL  || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const isWeb = Platform.OS === 'web';

// Create client only when configured — prevents crashes in guest mode
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage:            AsyncStorage,
        autoRefreshToken:   true,
        persistSession:     true,
        detectSessionInUrl: isWeb,
      },
    })
  : null;

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function oAuthSignIn(provider) {
  if (!supabase) throw new Error('Supabase not configured');

  if (isWeb) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location?.origin ?? '' },
    });
    if (error) throw error;
    return data;
  }

  // Mobile: open an in-app browser, handle the deep-link callback ourselves.
  const redirectTo = 'etapa://auth/callback';
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new Error('Authentication cancelled');

  const fragment = result.url.split('#')[1] || result.url.split('?')[1] || '';
  const params = new URLSearchParams(fragment);
  const accessToken  = params.get('access_token');
  const refreshToken = params.get('refresh_token') || '';

  if (!accessToken) throw new Error('No access token in callback URL');

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token:  accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) throw sessionError;
  return sessionData;
}

export async function signInWithGoogle() {
  return oAuthSignIn('google');
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token || null;
}

export function onAuthStateChange(callback) {
  if (!supabase) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
  return () => subscription.unsubscribe();
}
