# Etapa

**An AI cycling coach for beginners and every rider after that.**

Etapa builds personalised cycling training plans in plain English — no jargon, no intimidation, no assumption that you already know what FTP means. The iOS app launches soon; in the meantime the coach is already available as an [MCP server](#mcp-server) for any AI assistant.

- Website: [getetapa.com](https://getetapa.com)
- Launch blog post: [getetapa.com/blog/etapa-mcp-launch](https://getetapa.com/blog/etapa-mcp-launch)
- Instagram: [@getetapa](https://www.instagram.com/getetapa/)
- YouTube: [@getetapa](https://www.youtube.com/@getetapa)

---

## MCP Server

[![npm version](https://img.shields.io/npm/v/etapa-mcp.svg)](https://www.npmjs.com/package/etapa-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.rhoneybul%2Fetapa--mcp-E8458B)](https://registry.modelcontextprotocol.io/v0/servers/io.github.rhoneybul/etapa-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

The [`etapa-mcp`](./mcp-server) package is an [MCP](https://modelcontextprotocol.io) server that plugs Etapa's cycling coach into any MCP-compatible AI assistant — Claude Desktop, Cursor, Windsurf, ChatGPT connectors, and more.

### What it does

Four tools are exposed:

- **`generate_training_plan`** — generates a personalised 2-4 week cycling training plan tailored to the rider's fitness level, goal, and available days.
- **`cycling_beginner_guide`** — returns curated, jargon-free guidance across 9 topics: choosing a first bike, essential gear, first rides, nutrition, road safety, bike fit, building a habit, and common beginner mistakes.
- **`ask_cycling_coach`** — open-ended Q&A with Etapa's AI cycling coach. Plan adaptations ("I missed a ride, what now?"), training theory, recovery advice — answered in plain English, no jargon.
- **`review_cycling_plan`** — give it any cycling plan (from another app, a book, a YouTube video, a coach) and get Etapa's honest structured critique.

All tools are free, no account, no API key required.

### Quick install (Claude Desktop)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

Restart Claude Desktop, then ask:

> *"Use Etapa to build me a 3-week plan for my first 30 km ride."*

### Hosted HTTP endpoint

If you don't want to install anything locally, point any MCP client at:

```
https://etapa-mcp-production.up.railway.app/mcp
```

Free, no auth required. Streamable HTTP transport.

### Transport options

| Transport | How to connect | Use case |
|---|---|---|
| stdio | `npx -y etapa-mcp` | Local AI assistants (Claude Desktop, Cursor, Windsurf) |
| streamable-http | `https://etapa-mcp-production.up.railway.app/mcp` | Web-based clients, ChatGPT custom connectors, programmatic integration |

### Source and documentation

Full MCP server source, development setup, and publishing flow: **[`/mcp-server/`](./mcp-server)**.

---

## The Etapa iOS App

A React Native / Expo app launching soon. Features:

- 24-week training plans with proper periodisation (base → build → peak → taper)
- Live AI coach chat — 6 distinct coach personas you can switch between
- Strava sync for automatic ride tracking
- Plain-English session instructions
- Built specifically for beginners, women getting into cycling, and returning riders

**[Register interest here](https://getetapa.com/#register-interest)** — we'll let you know the moment it's live.

### Pricing

- **Starter** — £14.99 one-time, 3 months access (beginner pick)
- **Monthly** — £7.99/month
- **Annual** — £49.99/year
- **Lifetime** — £99.99 launch special

All subscriptions include a 7-day free trial.

---

## Repository structure

```
etapa/
├── src/                # React Native / Expo app (iOS + Android)
├── server/             # Node.js API (Railway)
├── mcp-server/         # MCP server (npm: etapa-mcp)
├── admin-dashboard/    # Next.js admin panel
├── website/            # Static marketing site (Vercel)
│   └── blog/           # Long-form content for beginner cyclists
├── supabase/           # Database migrations + config
└── ios/ android/       # Native project files
```

Each folder has its own README with more detail.

---

## License

MIT. See [LICENSE](./LICENSE) for details.

---

## Questions / feedback

- Found a bug or have a feature idea? [Open an issue](https://github.com/rhoneybul/etapa/issues).
- Email: [helloetapa@gmail.com](mailto:helloetapa@gmail.com)
- Find us on [Instagram](https://www.instagram.com/getetapa/) or [YouTube](https://www.youtube.com/@getetapa).
