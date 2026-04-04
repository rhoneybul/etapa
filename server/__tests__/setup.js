/**
 * Test setup — creates a test user in Supabase and provides auth helpers.
 *
 * Required env vars (set in .env.test or CI secrets):
 *   SUPABASE_URL          — your test Supabase project URL
 *   SUPABASE_ANON_KEY     — anon key for the test project
 *   SUPABASE_SERVICE_KEY   — service role key (for creating/deleting test users)
 *   TEST_USER_EMAIL        — e.g. test@etapa.test
 *   TEST_USER_PASSWORD     — e.g. TestPassword123!
 */
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load test env
require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceKey || !anonKey) {
  throw new Error(
    'Missing test env vars. Copy server/.env.test.example to server/.env.test and fill in your test Supabase credentials.'
  );
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);
const supabaseAnon = createClient(supabaseUrl, anonKey);

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'test@etapa.test';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPassword123!';

let _testToken = null;
let _testUserId = null;

/**
 * Ensure a test user exists and return an auth token.
 * Called once before all tests via globalSetup or beforeAll.
 */
async function getTestAuth() {
  if (_testToken) return { token: _testToken, userId: _testUserId };

  // Try signing in first (user may already exist from a previous run)
  let { data, error } = await supabaseAnon.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (error) {
    // User doesn't exist — create via admin API
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    if (createErr) throw new Error(`Failed to create test user: ${createErr.message}`);

    // Now sign in
    const { data: signIn, error: signInErr } = await supabaseAnon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (signInErr) throw new Error(`Failed to sign in test user: ${signInErr.message}`);
    data = signIn;
  }

  _testToken = data.session.access_token;
  _testUserId = data.user.id;
  return { token: _testToken, userId: _testUserId };
}

/**
 * Clean up test data (goals, plans, activities) for the test user.
 * Called in afterAll to leave the DB clean.
 */
async function cleanupTestData() {
  if (!_testUserId) return;

  // Delete in dependency order
  await supabaseAdmin.from('activities').delete().eq('user_id', _testUserId);
  await supabaseAdmin.from('chat_sessions').delete().eq('user_id', _testUserId);
  await supabaseAdmin.from('plans').delete().eq('user_id', _testUserId);
  await supabaseAdmin.from('plan_configs').delete().eq('user_id', _testUserId);
  await supabaseAdmin.from('goals').delete().eq('user_id', _testUserId);
  await supabaseAdmin.from('notifications').delete().eq('user_id', _testUserId);
  await supabaseAdmin.from('push_tokens').delete().eq('user_id', _testUserId);
  await supabaseAdmin.from('user_preferences').delete().eq('user_id', _testUserId);
  await supabaseAdmin.from('feedback').delete().eq('user_id', _testUserId);
}

module.exports = {
  getTestAuth,
  cleanupTestData,
  supabaseAdmin,
  TEST_EMAIL,
};
