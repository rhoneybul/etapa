# Running the plan-generator tests

There are two entry points to the same test suite — a CLI runner and a browser dashboard. Both share `SCENARIOS` (34 of them, including 4 regression tests for the April 2026 bugs) and validate generated plans against the same rules.

## The quick version

```
# CLI — fast, no setup, runs local deterministic generator
node --import ./tests/loader.mjs tests/planGenerator.test.js

# CLI + hit a real server (local or prod)
node --import ./tests/loader.mjs tests/planGenerator.test.js \
  --api http://localhost:3001 \
  --key $TEST_API_KEY

# Dashboard — visual, browser-based, streams results
cd tests/dashboard
npm install          # first time only
npm run dev          # open http://localhost:3000
```

## Option A — CLI (fastest)

**Local deterministic generator only:**

```
node --import ./tests/loader.mjs tests/planGenerator.test.js
```

Prints a table of pass/fail for all 34 scenarios against `src/services/planGenerator.js` (the offline fallback). ~2 seconds. No network.

**Against a real server (hits Claude):**

```
# Against your local server (start it first with `cd server && npm run dev`)
node --import ./tests/loader.mjs tests/planGenerator.test.js --api http://localhost:3001

# Against production — needs TEST_API_KEY configured on the server
node --import ./tests/loader.mjs tests/planGenerator.test.js \
  --api https://etapa.up.railway.app \
  --key $TEST_API_KEY
```

**Save results to a file for later review:**

```
node --import ./tests/loader.mjs tests/planGenerator.test.js \
  --api https://etapa.up.railway.app \
  --key $TEST_API_KEY \
  --output tests/api-results-latest.json
```

**Skip the edit/mutation tests if you just want generation checks:**

```
node --import ./tests/loader.mjs tests/planGenerator.test.js --skip-edits
```

## Option B — Dashboard (visual, easier to explore plans)

The dashboard lives at `tests/dashboard/` and is a standalone Next.js app.

### First-time setup

```
cd tests/dashboard
npm install
cp .env.example .env      # fill in GitHub OAuth creds if you want auth
```

`.env` values:

- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
- `GITHUB_ID` / `GITHUB_SECRET` — only if you want to lock it behind GitHub login. Skip if running locally.

### Run it

```
cd tests/dashboard
npm run dev
# open http://localhost:3000
```

### Two modes

**Load existing results (fast):** on the dashboard home page, click "Load API Results" and pick a saved JSON file (e.g. `tests/api-results-2026-04-08T10-58-33.json`). You get the full sidebar of scenarios, each with its generated plan, stats, and errors/warnings. Good for diff'ing runs over time.

**Run tests live (slower):** click "Run Tests" (top-right), enter the server URL + API key, hit start. The test run streams back via Server-Sent Events so you see each scenario complete in real time. When done, click "Download results" to save the JSON for later.

### What to look at when reviewing a run

For each scenario in the sidebar:

- **Badge** — PASS (green), WARN (yellow) or FAIL (red)
- **Stats row** — activity count, rides, strength, recurring, organised, recovery
- **Errors section** — hard failures (a bug; this MUST be fixed)
- **Warnings section** — soft issues (probably OK but worth a look)
- **Plan Calendar** — visual week-by-week layout showing what Claude actually produced
- **Weekly Volume** — bar chart of km/week, useful for spotting deload weeks and volume spikes

## The regression tests

Four scenarios at the bottom of the list lock in specific bugs so they can't come back. If any of these turn red, the fix has regressed.

| Scenario | What it guards against |
|---|---|
| `REGRESSION: 3 rides/week outdoor only, NO strength` | "I asked for 3 rides, got 1 ride + 1 strength" — the original user-reported bug. Plan must have 3 planned rides per week in build-phase weeks, and zero strength sessions. |
| `REGRESSION: beginner flow, outdoor only, NO strength` | The beginner "Get into Cycling" flow was unconditionally adding a strength session from week 3. Beginner with `trainingTypes:['outdoor']` must produce zero strength sessions. |
| `REGRESSION: 3 rides + 1 strength explicitly requested` | Positive test — when the user DOES request strength, the plan must honour it. 3 rides + 1 strength = 4 sessions per build week. |
| `REGRESSION: 5 rides/week honoured in build phase` | Higher-count coverage. 5 rides/week must show up as ~5 sessions in build-phase weeks (slack of 1 for deload). |

The new assertions powering these tests live in `validate()` (both in `tests/planGenerator.test.js` and `tests/dashboard/src/app/api/run-tests/route.js`):

- **Session-count floor** — for each week, `count >= requestedPerWeek - 1` (1 slack for deload) in build phase; taper weeks allowed to drop to 1.
- **No uninvited strength** — if `config.trainingTypes` doesn't include `'strength'`, zero strength activities allowed.

## Workflow when debugging a failing scenario

1. Click the failing scenario in the dashboard sidebar.
2. Read the Errors section at the top.
3. Scroll to the Plan Calendar — you'll usually spot the specific week where it went wrong.
4. Copy the scenario's `goal` + `config` from the Input cards (or from `tests/dashboard/src/lib/scenarios.js`) and re-run JUST that scenario locally:

```
# Temporarily narrow the SCENARIOS array in tests/planGenerator.test.js to
# the single case, then re-run the CLI. Or use the Raw JSON block at the
# bottom of the dashboard page and paste it into a REPL.
```

5. If the fix is in the prompt, edit `server/src/routes/ai.js` and re-run. If the fix is in the post-processing / conflict resolver, edit the same file (lines 1590–1730ish).

## Known local-generator limitations

The CLI's local mode uses `src/services/planGenerator.js` — a deterministic fallback used when the server is unreachable. It doesn't fully implement everything the LLM path does, so a handful of scenarios fail locally but pass against the API. Current known gaps:

- `REGRESSION: 3 rides + 1 strength explicitly requested` — local generator doesn't produce strength sessions at all.
- `Expert - 6 days + recurring group ride` — drops session count in weeks 6–7 of 8 (over-aggressive deload).
- `Edge: 3 consecutive organised rides` — one-offs displace planned sessions, dropping the count for the affected week.

These are tracked in task #5 and don't block the user-reported LLM bugs. When triaging, treat local failures as secondary and API failures as primary.

## When to run which

- **While developing** — CLI, local generator (`node --import … tests/planGenerator.test.js`) for the instant feedback loop.
- **Before a server deploy** — CLI with `--api http://localhost:3001` to verify prompt changes against a running server.
- **After a server deploy** — dashboard pointing at production. Visual review of plans is much faster than squinting at JSON diffs.
- **Before shipping a regression fix** — confirm the relevant `REGRESSION:` scenario goes from red → green.

---

*Last updated: April 2026.*
