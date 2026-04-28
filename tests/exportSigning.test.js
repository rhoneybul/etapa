/**
 * Offline tests for server/src/lib/exportSigning.
 *
 * Run: node tests/exportSigning.test.js
 */
process.env.EXPORT_SIGNING_SECRET = 'test-secret-must-be-at-least-32-chars-long-yes';

const { signExportUrl, verifyExportRequest, computeSignature, canonicalPayload } =
  require('../server/src/lib/exportSigning');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  \u2705', msg); }
  else      { fail++; console.log('  \u274C', msg); }
}

const baseArgs = {
  baseUrl: 'https://example.test',
  userId: 'user-abc',
  planId: 'plan-1',
  activityId: 'act-9',
  format: 'zwo',
};

console.log('\n\u25B6 Sign + round-trip');
const { url, expiresAt } = signExportUrl(baseArgs);
assert(url.startsWith('https://example.test/api/exports/workout?'), 'URL has the right base + path');
assert(/planId=plan-1/.test(url), 'URL carries planId');
assert(/activityId=act-9/.test(url), 'URL carries activityId');
assert(/uid=user-abc/.test(url), 'URL carries uid');
assert(/format=zwo/.test(url), 'URL carries format');
assert(/sig=[A-Za-z0-9_-]+/.test(url), 'URL carries a base64url signature');
assert(typeof expiresAt === 'string' && new Date(expiresAt).getTime() > Date.now(), 'expiresAt is in the future');

const parsed = Object.fromEntries(new URL(url).searchParams.entries());
let v = verifyExportRequest(parsed);
assert(v.ok === true, 'fresh signed URL verifies');
assert(v.userId === 'user-abc' && v.format === 'zwo', 'verifier returns the original tuple');

console.log('\n\u25B6 Tamper detection');
v = verifyExportRequest({ ...parsed, planId: 'plan-2' });
assert(!v.ok && v.reason === 'bad_sig', 'changing planId fails signature check');

v = verifyExportRequest({ ...parsed, activityId: 'act-other' });
assert(!v.ok && v.reason === 'bad_sig', 'changing activityId fails signature check');

v = verifyExportRequest({ ...parsed, uid: 'user-other' });
assert(!v.ok && v.reason === 'bad_sig', 'changing uid fails signature check');

v = verifyExportRequest({ ...parsed, format: 'mrc' });
assert(!v.ok && v.reason === 'bad_sig', 'changing format fails signature check');

v = verifyExportRequest({ ...parsed, sig: 'AAAA' });
assert(!v.ok && v.reason === 'bad_sig', 'tampered short signature rejected');

v = verifyExportRequest({ ...parsed, sig: 'A'.repeat(parsed.sig.length) });
assert(!v.ok && v.reason === 'bad_sig', 'tampered same-length signature rejected');

console.log('\n\u25B6 Expiry');
const expired = signExportUrl({ ...baseArgs, ttlSeconds: -10 });
const expiredParsed = Object.fromEntries(new URL(expired.url).searchParams.entries());
v = verifyExportRequest(expiredParsed);
assert(!v.ok && v.reason === 'expired', 'expired URL is rejected');

console.log('\n\u25B6 Format whitelist');
const { url: fitUrl } = signExportUrl({ ...baseArgs, format: 'fit' });
const fitParsed = Object.fromEntries(new URL(fitUrl).searchParams.entries());
v = verifyExportRequest(fitParsed);
assert(!v.ok && v.reason === 'bad_format', 'unknown format rejected (only zwo and mrc)');

console.log('\n\u25B6 Missing params');
v = verifyExportRequest({});
assert(!v.ok && v.reason === 'missing_params', 'empty query rejected with missing_params');
v = verifyExportRequest({ uid: 'x', planId: 'p', activityId: 'a', format: 'zwo', exp: '999999999999' });
assert(!v.ok && v.reason === 'missing_params', 'missing sig rejected');

console.log('\n\u25B6 Cross-secret resistance');
const otherSecret = computeSignature(canonicalPayload({ userId: 'user-abc', planId: 'plan-1', activityId: 'act-9', format: 'zwo', exp: parsed.exp }));
assert(otherSecret === parsed.sig, 'same secret produces same sig');

console.log('\n' + '='.repeat(62));
console.log(`  EXPORT SIGNING: ${pass} passed, ${fail} failed`);
console.log('='.repeat(62) + '\n');
process.exit(fail ? 1 : 0);
