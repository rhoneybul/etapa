/**
 * Offline tests for the Slack lib. Mocks global fetch so we don't hit
 * an actual webhook. Covers: channel routing, dedupe, retry on 5xx,
 * give-up on 4xx, never-throws.
 */
process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.test/default';
process.env.SLACK_SIGNUPS_WEBHOOK_URL = 'https://hooks.slack.test/signups';

const slack = require('../server/src/lib/slack');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  \u2705', msg); } else { fail++; console.log('  \u274C', msg); } }

// ── Mock fetch ─────────────────────────────────────────────────────────────
let fetchCalls = [];
let fetchStub = null;
const origFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  fetchCalls.push({ url, opts });
  return fetchStub ? fetchStub({ url, opts }) : Promise.resolve({ ok: true, status: 200, text: () => '' });
};
function reset() {
  fetchCalls = [];
  fetchStub = null;
  // Clear the dedupe cache between tests
  slack._seen.clear();
}

(async () => {
  console.log('\n\u25B6 Channel routing');
  reset();
  await slack.notify('hello signups', { channel: 'signups' });
  ok(fetchCalls[0].url === 'https://hooks.slack.test/signups', 'signups channel uses signups webhook');
  reset();
  await slack.notify('hello default');
  ok(fetchCalls[0].url === 'https://hooks.slack.test/default', 'default channel uses default webhook');
  reset();
  await slack.notify('hello plans', { channel: 'plans' });
  ok(fetchCalls[0].url === 'https://hooks.slack.test/default', 'plans falls back to default when SLACK_PLANS_WEBHOOK_URL unset');

  console.log('\n\u25B6 Dedupe');
  reset();
  const r1 = await slack.notify('same payload', { channel: 'signups' });
  const r2 = await slack.notify('same payload', { channel: 'signups' });
  ok(r1.sent === true, 'first send succeeds');
  ok(r2.sent === false && r2.reason === 'duplicate', 'second identical payload deduped');
  ok(fetchCalls.length === 1, 'only one fetch was made');
  // Different channel resets the dedupe key
  reset();
  await slack.notify('same payload', { channel: 'signups' });
  const r3 = await slack.notify('same payload', { channel: 'plans' });
  ok(r3.sent === true, 'same payload on different channel is not deduped');

  console.log('\n\u25B6 Retry on 5xx');
  reset();
  let calls = 0;
  fetchStub = () => {
    calls++;
    return Promise.resolve(calls === 1
      ? { ok: false, status: 503, text: () => 'busy' }
      : { ok: true, status: 200, text: () => '' });
  };
  const r4 = await slack.notify('retry me', { channel: 'signups' });
  ok(r4.sent === true && r4.retried === true, '5xx retried and succeeded');
  ok(fetchCalls.length === 2, 'two fetch calls made');

  console.log('\n\u25B6 Give up on 4xx');
  reset();
  fetchStub = () => Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve('bad payload') });
  const r5 = await slack.notify('bad', { channel: 'signups' });
  ok(r5.sent === false && r5.reason === 'http_400', '4xx returns immediately');
  ok(fetchCalls.length === 1, 'no retry on 4xx');

  console.log('\n\u25B6 Never throws');
  reset();
  fetchStub = () => Promise.reject(new Error('network down'));
  let threw = false;
  try { await slack.notify('throw me', { channel: 'signups' }); }
  catch { threw = true; }
  ok(!threw, 'network error did not throw');

  console.log('\n\u25B6 Unconfigured webhook');
  reset();
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_SIGNUPS_WEBHOOK_URL;
  // Re-require to bust env reads — the lib reads env on every webhookFor() call so we don't actually need to reload.
  const r6 = await slack.notify('no webhook', { channel: 'signups' });
  ok(r6.sent === false && r6.reason === 'no_webhook', 'missing webhook returns no_webhook');
  ok(fetchCalls.length === 0, 'no fetch when unconfigured');

  globalThis.fetch = origFetch;
  console.log('\n' + '='.repeat(60));
  console.log(`  SLACK LIB: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(60) + '\n');
  process.exit(fail ? 1 : 0);
})();
