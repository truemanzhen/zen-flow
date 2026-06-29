import { collectDoctorResults } from '../../commands/doctor.js';
import type { McpTool } from '../types.js';
import { jsonResult } from '../types.js';
import { optionalString, resolveProjectPath } from './common.js';

export const zcwDoctorTool: McpTool = {
  name: 'zcw_doctor',
  description: 'Run read-only ZCW doctor checks and return machine-readable results.',
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: 'Project root. Defaults to the MCP server current working directory.',
      },
      scope: {
        type: 'string',
        enum: ['auto', 'project', 'global'],
        description: 'Doctor scope. Defaults to auto.',
      },
      readiness: {
        type: 'boolean',
        description: 'Include bridge readiness checks.',
      },
    },
  },
  async handler(input) {
    const rawScope = optionalString(input, 'scope');
    const scope = rawScope === 'project' || rawScope === 'global' ? rawScope : 'auto';
    const readiness = input.readiness === true;
    const results = await collectDoctorResults(resolveProjectPath(input), scope, readiness);
    return jsonResult({ scope, readiness, results });
  },
};
