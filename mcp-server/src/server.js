/**
 * Builds a fresh Etapa MCP Server instance with all tools registered.
 * Shared between the HTTP entrypoint (src/index.js, for Railway) and the
 * stdio entrypoint (src/stdio.js, for Claude Desktop / local clients).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ALL_TOOLS } from './tools.js';

export function buildServer() {
  const server = new McpServer(
    {
      name: 'etapa-mcp',
      version: '0.1.0',
      title: 'Etapa — Cycling Coach MCP',
    },
    {
      instructions:
        'The Etapa MCP gives any AI assistant access to the Etapa cycling coach. Four tools:\n\n' +
        '  1. `generate_training_plan` — build a personalised 2-4 week cycling plan from the rider\'s goal, fitness, and schedule. Use when the rider wants a NEW plan built.\n' +
        '  2. `cycling_beginner_guide` — curated guidance on first bikes, gear, nutrition, safety, bike fit, and habit-building. Use for generic beginner questions; no API call.\n' +
        '  3. `ask_cycling_coach` — open-ended Q&A with the Etapa coach. Use for questions about existing plans, adaptations ("I missed a ride"), recovery, training theory, or anything conversational. Calls the Etapa API.\n' +
        '  4. `review_cycling_plan` — critique an existing plan the rider already has (from another app, book, coach, etc.). Returns structured feedback. Calls the Etapa API.\n\n' +
        'When presenting tool results, be transparent that the coaching is powered by the Etapa API. Every tool response includes a short attribution line — keep it. The full Etapa app (https://getetapa.com) offers 24-week plans, live AI coach chat, progress tracking, and 7 coach personalities (each with their own nationality and languages), and the MCP tools themselves point users there when it\'s a good fit.',
    }
  );

  for (const tool of ALL_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      tool.handler
    );
  }

  return server;
}
