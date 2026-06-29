import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { ToolRegistry } from '../../src/mcp/tool-registry.js';
import { createZCWMcpRegistry } from '../../src/mcp/tools/index.js';
import { listMcpTools } from '../../src/mcp/server.js';

async function writeChange(
  root: string,
  name: string,
  yaml: Record<string, string>,
  tasks = '- [x] done\n- [ ] todo\n',
): Promise<void> {
  const changeDir = path.join(root, 'specs', name);
  await fs.mkdir(changeDir, { recursive: true });
  await fs.writeFile(
    path.join(changeDir, '.zcw.yaml'),
    `${Object.entries(yaml)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')}\n`,
  );
  await fs.writeFile(path.join(changeDir, 'tasks.md'), tasks);
  await fs.writeFile(path.join(changeDir, 'spec.md'), '# Spec\n');
  await fs.writeFile(path.join(changeDir, 'plan.md'), '# Plan\n');
}

describe('ZCW MCP tools', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zcw-mcp-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.ZCW_ENABLED_TOOLS;
  });

  it('registers and executes tools by name', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'ping',
      description: 'Ping test tool',
      inputSchema: { type: 'object', properties: {} },
      async handler() {
        return { content: [{ type: 'text', text: 'pong' }], isError: false };
      },
    });

    await expect(registry.execute('ping', {})).resolves.toMatchObject({
      content: [{ type: 'text', text: 'pong' }],
      isError: false,
    });
    await expect(registry.execute('missing', {})).resolves.toMatchObject({
      isError: true,
    });
    expect(() =>
      registry.register({
        name: 'ping',
        description: 'Duplicate',
        inputSchema: { type: 'object', properties: {} },
        async handler() {
          return { content: [], isError: false };
        },
      }),
    ).toThrow(/already registered/);
  });

  it('filters visible tools with ZCW_ENABLED_TOOLS', () => {
    const registry = createZCWMcpRegistry();

    process.env.ZCW_ENABLED_TOOLS = 'zcw_status, zcw_dashboard_snapshot';

    expect(listMcpTools(registry).map((tool) => tool.name)).toEqual([
      'zcw_status',
      'zcw_dashboard_snapshot',
    ]);
  });

  it('returns a dashboard snapshot as JSON text', async () => {
    await writeChange(tmpDir, 'mcp-change', { workflow: 'full', phase: 'build' });
    const registry = createZCWMcpRegistry();

    const result = await registry.execute('zcw_dashboard_snapshot', { projectPath: tmpDir });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.summary.activeChanges).toBe(1);
    expect(payload.changes.active[0]).toMatchObject({
      name: 'mcp-change',
      phase: 'build',
    });
  });

  it('returns current status with next recommendation', async () => {
    await writeChange(tmpDir, 'next-design', { workflow: 'full', phase: 'design' });
    const registry = createZCWMcpRegistry();

    const result = await registry.execute('zcw_status', { projectPath: tmpDir });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.projectPath).toBe(path.resolve(tmpDir));
    expect(payload.summary.activeChanges).toBe(1);
    expect(payload.changes.active[0]).toMatchObject({
      name: 'next-design',
      phase: 'design',
    });
    expect(payload.recommendation.command).toBe('/zcw-design');
  });

  it('returns one change detail with yaml and artifact paths', async () => {
    await writeChange(tmpDir, 'detail-change', {
      workflow: 'full',
      phase: 'verify',
      verify_result: 'pending',
      design_doc: 'docs/superpowers/specs/detail-plan.md',
    });
    const registry = createZCWMcpRegistry();

    const result = await registry.execute('zcw_change_detail', {
      projectPath: tmpDir,
      change: 'detail-change',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.change).toBe('detail-change');
    expect(payload.yaml).toMatchObject({
      workflow: 'full',
      phase: 'verify',
      design_doc: 'docs/superpowers/specs/detail-plan.md',
    });
    expect(payload.artifacts.zcwYaml.exists).toBe(true);
    expect(payload.artifacts.tasks.exists).toBe(true);
  });

  it('reports a non-error setup hint when a requested change is missing', async () => {
    const registry = createZCWMcpRegistry();

    const result = await registry.execute('zcw_change_detail', {
      projectPath: tmpDir,
      change: 'missing-change',
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      found: false,
      change: 'missing-change',
    });
  });
});
