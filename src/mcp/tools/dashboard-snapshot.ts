import { collectDashboardSnapshot } from '../../dashboard/collector.js';
import type { McpTool } from '../types.js';
import { jsonResult } from '../types.js';
import { resolveProjectPath } from './common.js';

export const zcwDashboardSnapshotTool: McpTool = {
  name: 'zcw_dashboard_snapshot',
  description: 'Return the same read-only snapshot used by the ZCW dashboard API.',
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: 'Project root. Defaults to the MCP server current working directory.',
      },
    },
  },
  async handler(input) {
    return jsonResult(await collectDashboardSnapshot(resolveProjectPath(input)));
  },
};
