import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockedExecFileSync = vi.mocked(execFileSync);

describe('codegraph', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcw-codegraph-'));
    vi.resetAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects an existing project CodeGraph index', async () => {
    const codegraphDir = path.join(tmpDir, '.codegraph');
    fs.mkdirSync(codegraphDir, { recursive: true });
    fs.writeFileSync(path.join(codegraphDir, '.gitignore'), '*\n!.gitignore\n');

    const { hasCodegraphProjectIndex } = await import('../../src/core/codegraph.js');

    expect(hasCodegraphProjectIndex(tmpDir)).toBe(false);

    fs.writeFileSync(path.join(codegraphDir, 'codegraph.db'), '');

    expect(hasCodegraphProjectIndex(tmpDir)).toBe(true);
  });

  it('skips install when a project CodeGraph index already exists', async () => {
    const codegraphDir = path.join(tmpDir, '.codegraph');
    fs.mkdirSync(codegraphDir, { recursive: true });
    fs.writeFileSync(path.join(codegraphDir, 'codegraph.db'), '');

    const { installCodegraph } = await import('../../src/core/codegraph.js');
    const result = await installCodegraph(tmpDir, 'project');

    expect(result).toBe('skipped');
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  function createProjectCodegraphShim(): string {
    const binDir = path.join(tmpDir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    const shimName = process.platform === 'win32' ? 'codegraph.cmd' : 'codegraph';
    const shimPath = path.join(binDir, shimName);
    fs.writeFileSync(shimPath, '');
    return shimPath;
  }

  it('uses a project-local CodeGraph binary instead of reinstalling with npm', async () => {
    const shimPath = createProjectCodegraphShim();

    mockedExecFileSync.mockImplementation((command: unknown, args?: unknown) => {
      const cmd = String(command);
      if (cmd === shimPath) return Buffer.from('ok');
      return Buffer.from('ok');
    });

    const { installCodegraph } = await import('../../src/core/codegraph.js');
    const result = await installCodegraph(tmpDir, 'project');

    expect(result).toBe('installed');
    expect(mockedExecFileSync.mock.calls).not.toContainEqual(
      expect.arrayContaining([
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '-g', '@colbymchenry/codegraph'],
      ]),
    );
    expect(mockedExecFileSync.mock.calls).toContainEqual(
      expect.arrayContaining([shimPath, ['install', '--yes']]),
    );
  });

  it('reports CodeGraph status from node_modules without requiring a global CLI', async () => {
    const shimPath = createProjectCodegraphShim();

    const { getCodegraphStatus } = await import('../../src/core/codegraph.js');
    const status = getCodegraphStatus(tmpDir);

    expect(status).toMatchObject({
      command: shimPath,
      cliInstalled: true,
      indexed: false,
    });
    expect(status.next).toContain('zcw graph init');
  });

  it('runs CodeGraph search with fallback command candidates', async () => {
    const shimPath = createProjectCodegraphShim();
    fs.mkdirSync(path.join(tmpDir, '.codegraph'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.codegraph', 'codegraph.db'), '');

    mockedExecFileSync.mockImplementation((command: unknown, args?: unknown) => {
      const cmd = String(command);
      const cmdArgs = Array.isArray(args) ? args.map(String) : [];
      if (cmd === shimPath && cmdArgs[0] === 'search') {
        throw new Error('unsupported search');
      }
      if (cmd === shimPath && cmdArgs[0] === 'query') {
        return 'src/core/codegraph.ts\n';
      }
      throw new Error(`unexpected command: ${cmd} ${cmdArgs.join(' ')}`);
    });

    const { runCodegraphQuery } = await import('../../src/core/codegraph.js');
    const result = runCodegraphQuery(tmpDir, { mode: 'search', query: 'codegraph' });

    expect(result.args).toEqual(['query', 'codegraph']);
    expect(result.output).toBe('src/core/codegraph.ts');
  });

  it('includes CodeGraph output in zcw load --code JSON', async () => {
    const shimPath = createProjectCodegraphShim();
    fs.mkdirSync(path.join(tmpDir, '.codegraph'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.codegraph', 'codegraph.db'), '');

    mockedExecFileSync.mockImplementation((command: unknown, args?: unknown) => {
      const cmd = String(command);
      const cmdArgs = Array.isArray(args) ? args.map(String) : [];
      if (cmd === shimPath && cmdArgs[0] === 'search') {
        return 'src/commands/knowledge.ts\n';
      }
      throw new Error(`unexpected command: ${cmd} ${cmdArgs.join(' ')}`);
    });

    const { addKnowledgeEntry } = await import('../../src/core/knowledge.js');
    await addKnowledgeEntry(tmpDir, {
      kind: 'kn',
      title: 'Knowledge command',
      content: 'Searches local knowledge.',
    });

    const { loadCommand } = await import('../../src/commands/knowledge.js');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await loadCommand(tmpDir, { query: 'knowledge', code: true, json: true });
      json = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.codegraph.output).toBe('src/commands/knowledge.ts');
  });
});
