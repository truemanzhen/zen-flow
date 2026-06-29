import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'module';
import type { ToolRegistry } from './tool-registry.js';
import { createZCWMcpRegistry } from './tools/index.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

function enabledToolNames(): string[] {
  const raw = process.env.ZCW_ENABLED_TOOLS;
  if (!raw || raw.trim() === '') return ['all'];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function listMcpTools(registry: ToolRegistry): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  const enabled = enabledToolNames();
  const tools = registry.list();
  const filtered = enabled.includes('all')
    ? tools
    : tools.filter((tool) => enabled.includes(tool.name));

  return filtered.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export async function startMcpServer(registry = createZCWMcpRegistry()): Promise<void> {
  const server = new Server(
    { name: 'zcw', version },
    {
      capabilities: { tools: {} },
      instructions:
        'ZCW MCP exposes read-only workflow status, change detail, doctor checks, and dashboard snapshots. ' +
        'It does not write files or advance workflow phases.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listMcpTools(registry),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await registry.execute(name, (args ?? {}) as Record<string, unknown>);
    return {
      content: result.content,
      isError: result.isError,
    };
  });

  await server.connect(new StdioServerTransport());
}
