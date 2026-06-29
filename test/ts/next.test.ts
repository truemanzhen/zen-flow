import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { updateBridgeHandoff } from '../../src/core/bridge.js';
import { nextCommand } from '../../src/commands/next.js';
import { runCommand } from '../../src/commands/run.js';
import { statusCommand } from '../../src/commands/status.js';

describe('next command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `zcw-next-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('recommends continuing a pending session first', async () => {
    await runCommand('fix payment failure', tmpDir, { json: true });

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await nextCommand(tmpDir, { json: true });
      json = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(json);
    expect(parsed.recommendation).toMatchObject({
      command: 'zcw continue',
      source: 'session',
    });
    expect(parsed.recommendation.description).toContain('/zcw-hotfix');
  });

  it('recommends bridge execution when a handoff is ready', async () => {
    const featureDir = path.join(tmpDir, 'specs', 'handoff-ready');
    await fs.mkdir(featureDir, { recursive: true });
    await fs.writeFile(path.join(featureDir, 'tasks.md'), '- [ ] implement\n', 'utf-8');
    await fs.mkdir(path.join(tmpDir, '.specify'), { recursive: true });
    await updateBridgeHandoff(tmpDir, {
      status: 'ready',
      featureDirectory: 'specs/handoff-ready',
      actor: 'codex',
    });

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await nextCommand(tmpDir, { json: true });
      json = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(json);
    expect(parsed.recommendation).toMatchObject({
      command: '/zcw-build',
      source: 'bridge',
    });
  });

  it('adds the project next recommendation to status --next JSON', async () => {
    await runCommand('add OAuth login', tmpDir, { json: true });

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await statusCommand(tmpDir, { json: true, next: true });
      json = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(json);
    expect(parsed.sessionNext.step.command).toBe('/zcw-open');
    expect(parsed.nextRecommendation).toMatchObject({
      command: 'zcw continue',
      source: 'session',
    });
  });
});
