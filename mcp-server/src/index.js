/**
 * Etapa MCP server — HTTP entrypoint.
 *
 * Exposes the MCP protocol over Streamable HTTP (the spec replacement for SSE)
 * on POST/GET/DELETE /mcp. Deployed to Railway as a standalone service.
 *
 * Env:
 *   PORT            — Railway injects this automatically. Defaults to 3002 locally.
 *   ETAPA_API_URL   — base URL of the Etapa API (default https://etapa.up.railway.app)
 *   MCP_AUTH_TOKEN  — optional bearer token. If set, requests must include
 *                     `Authorization: Bearer <token>`. Leave unset to run open
 *                     (fine for a marketing-focused MCP that calls a public API).
 */
import express from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { buildServer } from './server.js';

const PORT = Number(process.env.PORT) || 3002;
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || '';

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS — MCP clients may connect from browsers / cross-origin tools
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, mcp-session-id, mcp-protocol-version'
  );
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Optional auth gate
function authGate(req, res, next) {
  if (!MCP_AUTH_TOKEN) return next();
  const header = req.headers.authorization || '';
  if (header === `Bearer ${MCP_AUTH_TOKEN}`) return next();
  return res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Unauthorized' },
    id: null,
  });
}

// ── Health ────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'etapa-mcp',
    version: '0.1.0',
    status: 'ok',
    docs: 'https://github.com/etapa/etapa/tree/main/mcp-server',
    mcpEndpoint: '/mcp',
  });
});
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── MCP transport — session-per-request, simplest reliable model ─────────
// Keep sessions keyed by mcp-session-id header. In production on a single
// Railway instance this in-memory map is fine.
const transports = new Map();

app.all('/mcp', authGate, async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];
    let transport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId);
    } else if (req.method === 'POST' && isInitializeRequest(req.body)) {
      // New session
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport);
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
      };

      const server = buildServer();
      await server.connect(transport);
    } else {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad request: no valid session ID and not an initialize request',
        },
        id: null,
      });
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error', data: err.message },
        id: null,
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`[etapa-mcp] Listening on :${PORT}`);
  console.log(`[etapa-mcp] MCP endpoint: POST http://localhost:${PORT}/mcp`);
  if (MCP_AUTH_TOKEN) {
    console.log('[etapa-mcp] Auth: enabled (Authorization: Bearer <token>)');
  } else {
    console.log('[etapa-mcp] Auth: disabled (set MCP_AUTH_TOKEN to require a bearer token)');
  }
});
