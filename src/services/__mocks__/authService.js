/**
 * Manual mock for src/services/authService.js. Mirrors the real
 * named exports.
 */
const supabaseStub = {
  auth: {
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    signInWithPassword: jest.fn().mockResolvedValue({ data: null, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  },
};

module.exports = {
  __esModule: true,
  isSupabaseConfigured: false,
  supabase: supabaseStub,
  signInWithGoogle: jest.fn().mockResolvedValue({ user: null, error: null }),
  signInWithApple: jest.fn().mockResolvedValue({ user: null, error: null }),
  signOut: jest.fn().mockResolvedValue({ ok: true }),
  getCurrentUser: jest.fn().mockResolvedValue(null),
  getSession: jest.fn().mockResolvedValue(null),
  getAccessToken: jest.fn().mockResolvedValue(null),
  onAuthStateChange: jest.fn(() => () => {}),
  getAuthHeaders: jest.fn().mockResolvedValue({}),
};
