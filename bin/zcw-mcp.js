#!/usr/bin/env node

import { startMcpServer } from '../dist/mcp/server.js';

startMcpServer().catch((error) => {
  console.error('ZCW MCP server failed to start:', error);
  process.exit(1);
});
