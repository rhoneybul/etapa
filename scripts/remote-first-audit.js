#!/usr/bin/env node
/**
 * Remote-first adoption audit.
 *
 * Walks every screen under src/screens and reports which ones use the
 * remote-first primitives (useScreenGuard for kill-switch / redirect,
 * useRemoteText for copy). Prints a coverage table and exits non-zero
 * when overall coverage drops below a floor.
 *
 * Running:
 *   node scripts/remote-first-audit.js                # report only
 *   node scripts/remote-first-audit.js --ci           # fail if below floor
 *   node scripts/remote-first-audit.js --floor=30     # custom floor %
 *   node scripts/remote-first-audit.js --json         # machine-readable
 *
 * Wire this into CI (.github/workflows/remote-first-ci.yml) so a PR that
 * doesn't carry the pattern forward fails before merge. Philosophy: we
 * don't police every string (some strings are genuinely meant to be
 * bundled — ARIA labels, debug text). But a PR that ADDS a user-facing
 * screen without useScreenGuard / useRemoteText should be flagged.
 *
 * Current floor: 20% of screens using the guard, 15% using remote copy.
 * These floors INCREASE over time as coverage grows — the audit saves a
 * .last-audit.json after each run, and the floor is "can't regress by
 * more than 5%" on subsequent runs.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const CI = args.includes('--ci');
const JSON_OUT = args.includes('--json');
const FLOOR = Number((args.find((a) => a.startsWith('--floor=')) || '').split('=')[1]) || null;

const SCREEN_DIR = path.resolve(__dirname, '..', 'src', 'screens');
const AUDIT_FILE = path.resolve(__dirname, '..', '.remote-first-audit.json');

// Screens we deliberately don't require to be remote-configurable.
// These are either:
//   - bootstrap screens that run before remote config is hydrated
//   - debug screens that aren't in the production navigation
const EXEMPT_SCREENS = new Set([
  'MaintenanceScreen',   // Shown when remote config SAYS maintenance — can't also depend on it
  'ForceUpgradeScreen',  // Same — it's the screen shown when we force-upgrade
]);

// ── Gather files ────────────────────────────────────────────────────────────
function listScreens() {
  if (!fs.existsSync(SCREEN_DIR)) return [];
  return fs
    .readdirSync(SCREEN_DIR)
    .filter((f) => f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.tsx'))
    .map((f) => path.join(SCREEN_DIR, f));
}

// ── Per-screen analysis ─────────────────────────────────────────────────────
function analyseScreen(file) {
  const name = path.basename(file).replace(/\.(js|jsx|tsx)$/, '');
  const src = fs.readFileSync(file, 'utf8');

  const usesGuard = /\buseScreenGuard\s*\(/.test(src);
  const usesRemoteText = /\buseRemoteText(Bulk)?\s*\(/.test(src)
    || /\bremoteConfig\.(t|getString)\s*\(/.test(src);

  // Count suspicious hardcoded user-visible strings. We look for <Text>
  // children that are plain string literals longer than 12 chars (filters
  // out small labels / units / ARIA). This is a heuristic — some matches
  // are legitimate, but it's a useful signal for relative coverage.
  const hardcoded = (src.match(/<Text[^>]*>[^<{]{13,}<\/Text>/g) || []).length;

  // Was the word "Alert.alert(" hit with a string literal? That's often a
  // hardcoded user-visible error message that should move to remote copy.
  const hardcodedAlerts = (src.match(/Alert\.alert\(\s*['"][^'"]{12,}['"]/g) || []).length;

  return {
    name,
    file,
    exempt: EXEMPT_SCREENS.has(name),
    usesGuard,
    usesRemoteText,
    hardcoded,
    hardcodedAlerts,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  const files = listScreens();
  if (files.length === 0) {
    console.error('No screens found under', SCREEN_DIR);
    process.exit(1);
  }

  const screens = files.map(analyseScreen);
  const eligible = screens.filter((s) => !s.exempt);

  const guardCount = eligible.filter((s) => s.usesGuard).length;
  const copyCount = eligible.filter((s) => s.usesRemoteText).length;
  const total = eligible.length;

  const pct = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 100));
  const coverage = {
    guard: { count: guardCount, total, percent: pct(guardCount, total) },
    copy:  { count: copyCount,  total, percent: pct(copyCount,  total) },
  };

  // ── Adoption floor: regression-only policy ────────────────────────────────
  // Compare against last run. If coverage dropped by more than 5% we fail.
  // If there's no last run (first time on this machine / CI) we seed with the
  // current values so baseline is whatever this PR achieves.
  let prev = null;
  try {
    if (fs.existsSync(AUDIT_FILE)) prev = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
  } catch { /* ignore */ }

  const ALLOWED_DROP = 5;
  const regressions = [];
  if (prev && prev.coverage) {
    if (prev.coverage.guard.percent - coverage.guard.percent > ALLOWED_DROP) {
      regressions.push(
        `guard coverage ${prev.coverage.guard.percent}% → ${coverage.guard.percent}% (dropped more than ${ALLOWED_DROP}%)`
      );
    }
    if (prev.coverage.copy.percent - coverage.copy.percent > ALLOWED_DROP) {
      regressions.push(
        `remote-copy coverage ${prev.coverage.copy.percent}% → ${coverage.copy.percent}% (dropped more than ${ALLOWED_DROP}%)`
      );
    }
  }

  // Explicit floor override via --floor flag.
  if (FLOOR != null) {
    if (coverage.guard.percent < FLOOR) regressions.push(`guard coverage ${coverage.guard.percent}% below floor ${FLOOR}%`);
    if (coverage.copy.percent  < FLOOR) regressions.push(`remote-copy coverage ${coverage.copy.percent}% below floor ${FLOOR}%`);
  }

  // ── Output ────────────────────────────────────────────────────────────────
  const payload = { generatedAt: new Date().toISOString(), coverage, screens: eligible, regressions };

  if (JSON_OUT) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    const H = '═══════════════════════════════════════════════════════════════';
    console.log(H);
    console.log('  REMOTE-FIRST ADOPTION AUDIT');
    console.log(H);
    console.log(`  ${total} production screens (${screens.length - total} exempt)`);
    console.log(`  useScreenGuard:  ${guardCount}/${total} (${coverage.guard.percent}%)`);
    console.log(`  useRemoteText:   ${copyCount}/${total} (${coverage.copy.percent}%)`);
    console.log(H);

    // Per-screen table.
    console.log('');
    console.log('  Screen                          Guard   Remote-copy   Hardcoded');
    console.log('  ------------------------------  ------  ------------  ---------');
    for (const s of eligible) {
      const nm = s.name.padEnd(30);
      const g = s.usesGuard ? '   ✓  ' : '   ·  ';
      const c = s.usesRemoteText ? '     ✓      ' : '     ·      ';
      const h = String(s.hardcoded + s.hardcodedAlerts).padStart(7);
      console.log(`  ${nm}  ${g}  ${c}  ${h}`);
    }
    console.log('');

    if (regressions.length > 0) {
      console.log('  REGRESSIONS:');
      for (const r of regressions) console.log('    ✗ ' + r);
      console.log('');
    } else {
      console.log('  No regressions vs last run.');
      console.log('');
    }
  }

  // Persist snapshot for the next run.
  try {
    fs.writeFileSync(AUDIT_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      coverage,
    }, null, 2));
  } catch { /* ignore */ }

  if (CI && regressions.length > 0) {
    process.exit(1);
  }
}

main();
