import { spawn } from 'child_process';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/speed-rules/run
 *
 * Runs the rideSpeedRules unit test file as a subprocess and returns the
 * structured results. The test file writes human-readable output to stdout;
 * we parse the ✅ / ❌ lines to build a pass/fail list for the UI.
 *
 * This gives the dashboard a live "prove the rules still hold" button
 * without having to duplicate the 52 assertions as dashboard scenarios.
 */
export async function POST() {
  const repoRoot = path.resolve(process.cwd(), '..', '..');
  const testFile = path.join(repoRoot, 'tests', 'rideSpeedRules.test.js');

  return new Promise((resolve) => {
    const child = spawn('node', [testFile], {
      cwd: repoRoot,
      env: { ...process.env, NODE_ENV: 'test' },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      resolve(Response.json(
        { error: `Failed to spawn: ${err.message}`, stdout, stderr },
        { status: 500 }
      ));
    });

    child.on('close', (code) => {
      // Parse the output. Format produced by tests/rideSpeedRules.test.js:
      //   ▶ <section name>
      //     ✅ <assertion name> ...
      //     ❌ <assertion name> ...
      // Plus a final "X passed, Y failed" summary line.
      const lines = stdout.split('\n');
      const sections = [];
      let currentSection = null;

      for (const raw of lines) {
        const line = raw.replace(/\u001b\[[0-9;]*m/g, ''); // strip ANSI
        const sectionMatch = line.match(/^▶\s+(.*)$/);
        if (sectionMatch) {
          currentSection = { name: sectionMatch[1].trim(), assertions: [] };
          sections.push(currentSection);
          continue;
        }
        const passMatch = line.match(/^\s*✅\s+(.*)$/);
        const failMatch = line.match(/^\s*❌\s+(.*)$/);
        if (passMatch && currentSection) {
          currentSection.assertions.push({ ok: true, label: passMatch[1].trim() });
        } else if (failMatch && currentSection) {
          currentSection.assertions.push({ ok: false, label: failMatch[1].trim() });
        }
      }

      const summaryMatch = stdout.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
      const summary = summaryMatch
        ? { passed: Number(summaryMatch[1]), failed: Number(summaryMatch[2]) }
        : null;

      resolve(Response.json({
        exitCode: code,
        ok: code === 0,
        summary,
        sections,
        // Surface raw output for debugging if parsing misses anything.
        stdout: stdout.slice(-5000),
        stderr: stderr.slice(-2000),
      }));
    });
  });
}
