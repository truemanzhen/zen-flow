import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { continueCommand } from '../../src/commands/continue.js';
import { runCommand } from '../../src/commands/run.js';
import { statusCommand } from '../../src/commands/status.js';
import { planWorkflow } from '../../src/core/session.js';
import { addKnowledgeEntry } from '../../src/core/knowledge.js';

describe('ZCW workflow sessions', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `zcw-session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('classifies intents into small ZCW chains', () => {
    expect(planWorkflow('add OAuth login').chainName).toBe('feature');
    expect(planWorkflow('修复支付失败').chainName).toBe('hotfix');
    expect(planWorkflow('微调按钮文案').chainName).toBe('tweak');
    expect(planWorkflow('已有 tasks.md，交接给 Superpowers 执行').chainName).toBe('bridge');
  });

  it('dry-run prints a chain without creating a session', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let output = '';
    try {
      await runCommand('add OAuth login', tmpDir, { dryRun: true });
      output = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    expect(output).toContain('Chain: feature');
    expect(output).toContain('/zcw-open');
    await expect(fs.stat(path.join(tmpDir, '.zcw', 'sessions'))).rejects.toThrow();
  });

  it('creates a resumable session and reports the next step', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runCommand('修复支付失败', tmpDir);
    } finally {
      log.mockRestore();
    }

    const sessions = await fs.readdir(path.join(tmpDir, '.zcw', 'sessions'));
    expect(sessions).toHaveLength(1);
    const status = JSON.parse(
      await fs.readFile(path.join(tmpDir, '.zcw', 'sessions', sessions[0], 'status.json'), 'utf-8'),
    );
    expect(status.chainName).toBe('hotfix');
    expect(status.steps[0].command).toBe('/zcw-hotfix');
    expect(status.knowledgeContext).toMatchObject({
      query: status.intent,
      skipped: false,
      entries: [],
      codegraph: null,
      warnings: [],
    });

    const continueLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let continueOutput = '';
    try {
      await continueCommand(tmpDir);
      continueOutput = continueLog.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      continueLog.mockRestore();
    }

    expect(continueOutput).toContain('Next: /zcw-hotfix');
  });

  it('includes latest session next step in status JSON when requested', async () => {
    await runCommand('微调按钮文案', tmpDir, { json: true });

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await statusCommand(tmpDir, { json: true, next: true });
      json = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(json);
    expect(parsed.sessionNext.session.chainName).toBe('tweak');
    expect(parsed.sessionNext.step.command).toBe('/zcw-tweak');
  });

  it('loads matching knowledge into the created session before the first step', async () => {
    await addKnowledgeEntry(tmpDir, {
      kind: 'kn',
      title: 'Payment retry',
      content: 'Payment failures should use idempotency keys before retry.',
      tags: ['payment'],
    });

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let output = '';
    try {
      await runCommand('fix payment retry failure', tmpDir);
      output = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const sessions = await fs.readdir(path.join(tmpDir, '.zcw', 'sessions'));
    const status = JSON.parse(
      await fs.readFile(path.join(tmpDir, '.zcw', 'sessions', sessions[0], 'status.json'), 'utf-8'),
    );

    expect(output).toContain('knowledge: 1 entries loaded');
    expect(status.knowledgeContext.entries).toHaveLength(1);
    expect(status.knowledgeContext.entries[0].entry.title).toBe('Payment retry');
  });

  it('records an explicit knowledge skip in the session', async () => {
    await runCommand('add OAuth login', tmpDir, { json: true, knowledge: false });

    const sessions = await fs.readdir(path.join(tmpDir, '.zcw', 'sessions'));
    const status = JSON.parse(
      await fs.readFile(path.join(tmpDir, '.zcw', 'sessions', sessions[0], 'status.json'), 'utf-8'),
    );

    expect(status.knowledgeContext).toMatchObject({
      skipped: true,
      entries: [],
      codegraph: null,
    });
    expect(status.knowledgeContext.warnings[0]).toContain('--no-knowledge');
  });

  it('records CodeGraph warnings without blocking session creation', async () => {
    await runCommand('add OAuth login', tmpDir, { json: true, code: true });

    const sessions = await fs.readdir(path.join(tmpDir, '.zcw', 'sessions'));
    const status = JSON.parse(
      await fs.readFile(path.join(tmpDir, '.zcw', 'sessions', sessions[0], 'status.json'), 'utf-8'),
    );

    expect(status.knowledgeContext.skipped).toBe(false);
    expect(status.knowledgeContext.codegraph).toBeNull();
    expect(status.knowledgeContext.warnings.join('\n')).toContain('CodeGraph load failed');
  });
});
