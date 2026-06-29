import path from 'path';
import { fileExists } from '../../utils/file-system.js';
import { readZCWYaml } from '../../dashboard/yaml.js';
import type { McpTool } from '../types.js';
import { jsonResult } from '../types.js';
import { artifactInfo, optionalString, readTextIfExists, resolveProjectPath } from './common.js';

export const zcwChangeDetailTool: McpTool = {
  name: 'zcw_change_detail',
  description: 'Read one ZCW change state, artifact paths, and handoff metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: 'Project root. Defaults to the MCP server current working directory.',
      },
      change: {
        type: 'string',
        description: 'Active change name under specs/<change>.',
      },
    },
    required: ['change'],
  },
  async handler(input) {
    const projectPath = resolveProjectPath(input);
    const change = optionalString(input, 'change');
    if (!change) {
      return jsonResult({ found: false, reason: 'Missing required argument: change' });
    }

    const changeDir = path.join(projectPath, 'specs', change);
    const yamlPath = path.join(changeDir, '.zcw.yaml');
    if (!(await fileExists(changeDir)) || !(await fileExists(yamlPath))) {
      return jsonResult({
        found: false,
        change,
        path: path.relative(projectPath, changeDir).replace(/\\/g, '/'),
        reason: 'Change directory or .zcw.yaml was not found.',
      });
    }

    const yaml = (await readZCWYaml(yamlPath)) ?? {};
    const relative = (relPath: string) => path.join('specs', change, relPath).replace(/\\/g, '/');
    const handoffContext =
      yaml.handoff_context && yaml.handoff_context !== 'null' ? yaml.handoff_context : null;

    return jsonResult({
      found: true,
      change,
      path: path.relative(projectPath, changeDir).replace(/\\/g, '/'),
      yaml,
      artifacts: {
        zcwYaml: await artifactInfo(projectPath, relative('.zcw.yaml')),
        spec: await artifactInfo(projectPath, relative('spec.md')),
        plan: await artifactInfo(projectPath, relative('plan.md')),
        tasks: await artifactInfo(projectPath, relative('tasks.md')),
        designDoc:
          yaml.design_doc && yaml.design_doc !== 'null'
            ? await artifactInfo(projectPath, yaml.design_doc)
            : { path: null, exists: false },
        handoffContext: handoffContext
          ? await artifactInfo(projectPath, handoffContext)
          : { path: null, exists: false },
      },
      handoff: {
        context: handoffContext,
        hash: yaml.handoff_hash && yaml.handoff_hash !== 'null' ? yaml.handoff_hash : null,
        preview: handoffContext
          ? await readTextIfExists(path.join(projectPath, handoffContext))
          : null,
      },
    });
  },
};
