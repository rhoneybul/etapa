#!/usr/bin/env node
/**
 * Etapa MCP server — stdio entrypoint for local clients (Claude Desktop, Cursor,
 * Windsurf, etc.). Use this if you want the MCP to run on your own machine
 * instead of against the hosted Railway deployment.
 *
 * Example Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "etapa": {
 *         "command": "npx",
 *         "args": ["-y", "etapa-mcp"]
 *       }
 *     }
 *   }
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';

async function main() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[etapa-mcp] stdio transport connected');
}

main().catch((err) => {
  console.error('[etapa-mcp] fatal:', err);
  process.exit(1);
});
