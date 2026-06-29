import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { auditCommand, reviewCommand, testCommand } from '../../src/commands/quality.js';
import { runCommand } from '../../src/commands/run.js';

describe('ZCW quality pipeline', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `zcw-quality-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function readLatest(kind: 'audit' | 'test' | 'review') {
    return JSON.parse(
      await fs.readFile(path.join(tmpDir, '.zcw', 'quality', `${kind}-latest.json`), 'utf-8'),
    );
  }

  it('writes audit artifacts and syncs the latest session summary', async () => {
    await runCommand('add OAuth login', tmpDir, { json: true });
    const changeDir = path.join(tmpDir, 'specs', 'login');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(
      path.join(changeDir, '.zcw.yaml'),
      ['workflow: full', 'phase: build', 'archived: false', ''].join('\n'),
    );
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [ ] implement\n', 'utf-8');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await auditCommand(tmpDir, { json: true });
    } finally {
      log.mockRestore();
    }

    const latest = await readLatest('audit');
    expect(latest.kind).toBe('audit');
    expect(latest.artifacts.latest).toContain(path.join('.zcw', 'quality', 'audit-latest.json'));
    expect(latest.artifacts.run).toContain(path.join('.zcw', 'quality', 'runs'));
    expect(latest.checks.some((check: { id: string }) => check.id.endsWith('.build-plan'))).toBe(
      true,
    );

    const sessions = await fs.readdir(path.join(tmpDir, '.zcw', 'sessions'));
    const session = JSON.parse(
      await fs.readFile(path.join(tmpDir, '.zcw', 'sessions', sessions[0], 'status.json'), 'utf-8'),
    );
    expect(session.qualityResults.audit.status).toBe(latest.status);
  });

  it('runs a package test script and stores stdout', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'node -e "console.log(123)"' } }, null, 2),
      'utf-8',
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await testCommand(tmpDir, { json: true });
    } finally {
      log.mockRestore();
    }

    const latest = await readLatest('test');
    expect(latest.status).toBe('pass');
    expect(latest.data.stdout).toContain('123');
  });

  it('writes review artifacts without requiring a git repository', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await reviewCommand(tmpDir, { json: true });
    } finally {
      log.mockRestore();
    }

    const latest = await readLatest('review');
    expect(latest.kind).toBe('review');
    expect(latest.checks.find((check: { id: string }) => check.id === 'review.git-dirty')).toBeDefined();
  });
});
