import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { bridgeGuardCommand, bridgeHandoffCommand } from '../../src/commands/bridge.js';
import { doctorCommand } from '../../src/commands/doctor.js';
import { statusCommand } from '../../src/commands/status.js';

describe('ZCW bridge', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `zcw-bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(path.join(tmpDir, '.specify'), { recursive: true });
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function createFeature(name = 'bridge-feature') {
    const featureDir = path.join(tmpDir, 'specs', name);
    await fs.mkdir(featureDir, { recursive: true });
    await fs.writeFile(path.join(featureDir, 'spec.md'), '# Spec\n', 'utf-8');
    await fs.writeFile(path.join(featureDir, 'plan.md'), '# Plan\n', 'utf-8');
    await fs.writeFile(path.join(featureDir, 'tasks.md'), '- [x] done\n- [ ] todo\n', 'utf-8');
    await fs.writeFile(
      path.join(featureDir, '.zcw.yaml'),
      ['workflow: full', 'phase: build', 'archived: false', ''].join('\n'),
      'utf-8',
    );
    return featureDir;
  }

  it('creates a handoff by inferring the Spec Kit feature directory', async () => {
    await createFeature('inferred');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await bridgeHandoffCommand(tmpDir, { status: 'ready', actor: 'codex' });
    } finally {
      log.mockRestore();
    }

    const handoff = JSON.parse(
      await fs.readFile(path.join(tmpDir, '.specify', 'superpowers-handoff.json'), 'utf-8'),
    );
    expect(handoff).toMatchObject({
      status: 'ready',
      feature_directory: 'specs/inferred',
      artifact_owner: 'spec-kit',
      implementation_owner: 'superpowers',
      actor: 'codex',
    });

    const events = await fs.readFile(path.join(tmpDir, '.specify', 'bridge-events.jsonl'), 'utf-8');
    expect(events).toContain('"action":"handoff"');
  });

  it('denies speckit.implement while a Superpowers handoff is executing', async () => {
    await createFeature('guarded');
    await bridgeHandoffCommand(tmpDir, { status: 'executing', actor: 'codex' });

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let output = '';
    try {
      await bridgeGuardCommand(tmpDir, { action: 'speckit.implement', actor: 'codex' });
      output = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    expect(output).toContain('ZCW bridge guard deny');
    expect(process.exitCode).toBe(1);
  });

  it('includes bridge state in status JSON when requested', async () => {
    await createFeature('status-bridge');
    await bridgeHandoffCommand(tmpDir, { status: 'executing', actor: 'claude' });

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await statusCommand(tmpDir, { json: true, bridge: true });
      json = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(json);
    expect(parsed.bridge).toMatchObject({
      state: 'parseable',
      status: 'executing',
      featureDirectory: 'specs/status-bridge',
      pendingTasks: 1,
    });
  });

  it('adds bridge readiness checks to doctor output', async () => {
    await createFeature('doctor-bridge');
    await bridgeHandoffCommand(tmpDir, { status: 'ready', actor: 'codex' });

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await doctorCommand(tmpDir, { json: true, readiness: true });
      json = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const checks = JSON.parse(json).results as Array<{ check: string; status: string }>;
    expect(checks.find((check) => check.check === 'Spec Kit extension assets')).toMatchObject({
      status: 'pass',
    });
    expect(checks.find((check) => check.check === 'bridge handoff')).toMatchObject({
      status: 'pass',
    });
  });
});
