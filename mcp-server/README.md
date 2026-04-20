# Etapa MCP

An [MCP](https://modelcontextprotocol.io) server for [Etapa](https://getetapa.com) — an AI-powered cycling coach for beginners and every rider after that. Gives any MCP-compatible AI assistant four cycling superpowers:

- **`generate_training_plan`** — generates a personalised 2-4 week cycling training plan by calling the Etapa API.
- **`cycling_beginner_guide`** — returns curated beginner guidance on topics like choosing a first bike, essential gear, your first ride, nutrition, safety, bike fit, and building a habit.
- **`ask_cycling_coach`** — open-ended Q&A with Etapa's cycling coach. Plan adaptations ("I missed a ride, what now?"), recovery questions, training theory — answered in plain English, no jargon.
- **`review_cycling_plan`** — give it any cycling plan (from another app, a book, a YouTube video, a coach) and get Etapa's honest critique in four structured sections.

This is a marketing-focused MCP — every output is transparent about what Etapa is and links back to the app.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frhoneybul%2Fetapa%2Ftree%2Fmain%2Fmcp-server)

One click above deploys your own instance using the template at [`.railway/template.json`](./.railway/template.json). Or run `npm run railway:setup` from this folder for an interactive CLI setup.

---

## Running locally

```bash
cd mcp-server
cp .env.example .env
npm install
npm start
```

Server listens on `http://localhost:3002`. The MCP protocol endpoint is `POST /mcp` (see the [MCP spec](https://modelcontextprotocol.io/docs/concepts/transports) for details).

Test the health endpoint:

```bash
curl http://localhost:3002/health
```

---

## Using with Claude Desktop (stdio)

For local use with [Claude Desktop](https://claude.ai/download), [Cursor](https://cursor.sh), [Windsurf](https://codeium.com/windsurf), or any other MCP client, use the stdio entrypoint.

Once `etapa-mcp` is published to npm, add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "etapa": {
      "command": "npx",
      "args": ["-y", "etapa-mcp"]
    }
  }
}
```

Or run from this repo:

```json
{
  "mcpServers": {
    "etapa": {
      "command": "node",
      "args": ["/absolute/path/to/etapa/mcp-server/src/stdio.js"]
    }
  }
}
```

Restart Claude Desktop and you'll see the Etapa tools appear in the MCP section.

---

## Using the hosted version (HTTP)

Once deployed to Railway, MCP clients that support Streamable HTTP transport (e.g. [ChatGPT custom connectors](https://platform.openai.com/docs/guides/mcp), programmatic clients, future Claude updates) can connect directly:

```
https://etapa-mcp.up.railway.app/mcp
```

No authentication required by default. If you want to gate it behind a bearer token, set `MCP_AUTH_TOKEN` in Railway and clients must send `Authorization: Bearer <token>`.

---

## Deploying to Railway

You've got **three options**, pick what fits:

### Option A — One-click template button (easiest)

Click the **Deploy on Railway** button at the top of this README. Railway reads [`.railway/template.json`](./.railway/template.json), spins up the service with the right Root Directory + env vars + healthcheck + a generated domain. Takes ~2 minutes.

### Option B — Interactive CLI setup (fully automated)

From the `mcp-server/` folder:

```bash
npm run railway:setup
```

This runs [`scripts/railway-setup.sh`](./scripts/railway-setup.sh) which is idempotent and:

1. Installs the Railway CLI if missing
2. Logs you in
3. Links this folder to a Railway project (new or existing)
4. Creates the `etapa-mcp` service with the right config
5. Sets env vars interactively
6. Generates a public domain
7. Triggers a deploy
8. Prints a ready-to-paste Claude Desktop config

Other useful shortcuts:

```bash
npm run railway:deploy    # manual redeploy (no git push needed)
npm run railway:logs      # tail production logs
npm run railway:status    # show deploy status
npm run railway:open      # open the Railway dashboard
```

### Option C — Manual dashboard setup

1. Open your existing Etapa Railway project (or create a new one).
2. Click **New Service** → **GitHub Repo** → pick the Etapa repo.
3. In the service's Settings → Source, set **Root Directory** to `/mcp-server`.
4. Env vars:
   - `ETAPA_API_URL` — `https://etapa.up.railway.app`
   - `MCP_AUTH_TOKEN` — optional
5. Settings → Networking → **Generate Domain**.
6. Deploy.

### Automatic redeploys on git push

This folder's `railway.json` sets `watchPatterns: ["mcp-server/**"]`, so Railway's GitHub integration only rebuilds the MCP service when files under `mcp-server/` change — pushes that only touch the app, website, or admin dashboard are ignored by this service.

CI runs on every push/PR that touches `mcp-server/**` — see [`.github/workflows/mcp-ci.yml`](../.github/workflows/mcp-ci.yml). It does a syntax check, boots the server, hits `/health`, and runs an MCP `initialize` handshake. If you add `MCP_PROD_URL` as a GitHub secret, it'll also probe the production URL after a push to confirm the Railway deploy landed.

### Custom domain (e.g. `mcp.getetapa.com`)

Settings → Networking → Custom Domain → point your DNS CNAME to the Railway target. Takes ~2 min after DNS propagates.

---

## Publishing

### To npm (for `npx etapa-mcp` distribution)

```bash
cd mcp-server
npm login
npm publish --access public
```

Bump the version first with `npm version patch|minor|major`.

Once published, users can add it to Claude Desktop with just:

```json
{ "mcpServers": { "etapa": { "command": "npx", "args": ["-y", "etapa-mcp"] } } }
```

### To the MCP registry

The official community MCP registry lives at <https://github.com/modelcontextprotocol/servers>. To add Etapa:

1. Fork `modelcontextprotocol/servers`.
2. Edit `README.md` → add Etapa under "Community servers" with a one-liner description and link back to this repo.
3. Open a PR.

Also register on directories like:
- <https://mcp.so> — popular community directory
- <https://glama.ai/mcp/servers> — auto-indexed, just submit the repo URL
- <https://pulsemcp.com> — community-curated list

### Announce

Post in:
- r/mcp and r/ClaudeAI on Reddit
- #mcp channel on the Anthropic Discord
- Your own Instagram (@getetapa) and YouTube (@getetapa) with a demo video — "look, any AI can now write you a training plan"
- Hacker News (Show HN: Etapa — AI cycling coach, now as an MCP)

---

## Architecture

```
LLM / Claude Desktop
      │
      ▼ MCP protocol
┌─────────────────────┐
│  etapa-mcp (this)   │  Railway service — stateless, Node 20+
│                     │
│  tools:             │
│  - generate_plan ───┼──▶ https://etapa.up.railway.app/api/public/sample-plan
│  - beginner_guide   │    (Anthropic Claude under the hood)
└─────────────────────┘
```

The MCP server is stateless — each training-plan call hits the Etapa API, which hits Claude. The beginner guide is served directly from local content (`src/guide.js`).

---

## Tool reference

### `generate_training_plan`

Calls `POST /api/public/sample-plan` on the Etapa API.

| Input | Type | Default | Notes |
|---|---|---|---|
| `fitnessLevel` | `"beginner" \| "intermediate" \| "advanced"` | `beginner` | |
| `goalType` | `string` | `"general fitness"` | Free text, e.g. "first 50km sportive" |
| `targetDistanceKm` | `number` (0-300) | — | Target event distance, if applicable |
| `daysPerWeek` | `number` (2-6) | `3` | |
| `weeks` | `number` (2-4) | `3` | Capped at 4 — use the Etapa app for longer plans |
| `indoorTrainer` | `boolean` | `false` | |
| `notes` | `string` (≤300 chars) | — | Extra context |

Returns a markdown-formatted plan + structured `{ plan, meta }` with attribution.

### `cycling_beginner_guide`

No API call. Returns curated content.

| Input | Type | Notes |
|---|---|---|
| `topic` | enum, see below | Omit for the full index |

Available topics: `getting_started`, `first_bike`, `essential_gear`, `first_ride`, `nutrition_and_hydration`, `safety`, `building_a_habit`, `bike_fit`, `common_mistakes`.

### `ask_cycling_coach`

Calls `POST /api/public/coach-ask` on the Etapa API. Open-ended coaching Q&A. Best for plan adaptations ("I missed Monday, what now?"), training questions, recovery advice, or anything conversational.

| Input | Type | Notes |
|---|---|---|
| `question` | `string` (3-500 chars) | The rider's question |
| `context` | `string` (≤500 chars) | Optional — rider background (fitness, goal, schedule) |
| `planText` | `string` (≤3000 chars) | Optional — paste in their current plan if relevant |

Returns markdown answer + structured `{ answer, meta }` with attribution.

### `review_cycling_plan`

Calls `POST /api/public/review-plan` on the Etapa API. Takes any cycling plan (from another app, a book, a coach, a YouTube video) and returns a four-section critique.

| Input | Type | Notes |
|---|---|---|
| `plan` | `string` (20-3000 chars) | Paste the plan as text |
| `goal` | `string` (≤150 chars) | Optional — what the rider is training for |
| `fitnessLevel` | `"beginner" \| "intermediate" \| "advanced"` | Optional |

Returns markdown critique in four sections: **What's working**, **What's missing or risky**, **What I'd change**, **Bottom line** — plus structured `{ critique, meta }`.

---

## License

MIT. Part of the [Etapa](https://getetapa.com) project.
