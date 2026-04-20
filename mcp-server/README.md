# Etapa MCP

An [MCP](https://modelcontextprotocol.io) server for [Etapa](https://getetapa.com) — an AI-powered cycling coach for beginners and every rider after that. Gives any MCP-compatible AI assistant two cycling superpowers:

- **`generate_training_plan`** — generates a personalised 2-4 week cycling training plan by calling the Etapa API. Explicit, attributed, and honest about being a sample (the full Etapa app supports longer plans, live coach chat, and progress tracking).
- **`cycling_beginner_guide`** — returns curated beginner guidance on topics like choosing a first bike, essential gear, your first ride, nutrition, safety, bike fit, and building a habit.

This is a marketing-focused MCP — every output is transparent about what Etapa is and links back to the app.

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

This folder contains both `railway.json` and a `Dockerfile` — Railway will pick one of them automatically.

**First-time setup:**

1. Open your existing Etapa Railway project (or create a new one).
2. Click **New Service** → **GitHub Repo** → pick the Etapa repo.
3. In the service's Settings → Source, set the **Root Directory** to `/mcp-server`.
4. Environment variables:
   - `ETAPA_API_URL` — `https://etapa.up.railway.app` (or wherever your Etapa API is hosted)
   - `MCP_AUTH_TOKEN` — optional; leave empty for an open MCP
5. Settings → Networking → **Generate Domain** to get a public URL, e.g. `etapa-mcp.up.railway.app`.
6. Deploy. Railway will auto-detect either Nixpacks (via `railway.json`) or the Dockerfile.

**Custom domain (e.g. `mcp.getetapa.com`):**

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

---

## License

MIT. Part of the [Etapa](https://getetapa.com) project.
