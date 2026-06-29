import { collectDashboardSnapshot } from '../../dashboard/collector.js';
import { recommendProjectNext } from '../../commands/next.js';
import type { McpTool } from '../types.js';
import { jsonResult } from '../types.js';
import { resolveProjectPath } from './common.js';

export const zcwStatusTool: McpTool = {
  name: 'zcw_status',
  description: 'Read the current ZCW project status and next recommended action.',
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
    const projectPath = resolveProjectPath(input);
    const [snapshot, recommendation] = await Promise.all([
      collectDashboardSnapshot(projectPath),
      recommendProjectNext(projectPath),
    ]);

    return jsonResult({
      projectPath,
      summary: snapshot.summary,
      changes: snapshot.changes,
      risks: snapshot.risks,
      recommendation,
    });
  },
};
