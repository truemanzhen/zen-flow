import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { doctorCommand } from '../../src/commands/doctor.js';

describe('doctor command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `zcw-doctor-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts current zcw state fields in JSON output', async () => {
    const changeDir = path.join(tmpDir, 'specs', 'current-state');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(
      path.join(changeDir, '.zcw.yaml'),
      [
        'workflow: full',
        'phase: verify',
        'context_compression: off',
        'build_mode: executing-plans',
        'build_pause: null',
        'subagent_dispatch: null',
        'tdd_mode: tdd',
        'review_mode: standard',
        'isolation: branch',
        'verify_mode: full',
        'auto_transition: true',
        'verify_result: pending',
        'design_doc: specs/current-state/plan.md',
        'plan: specs/current-state/tasks.md',
        'verification_report: specs/current-state/.zcw/verify-result.md',
        'branch_status: handled',
        'verified_at: null',
        'archived: false',
        'direct_override: false',
        'build_command: pnpm build',
        'verify_command: pnpm test',
        'handoff_context: specs/current-state/.zcw/spec-context.md',
        'handoff_hash: abc123',
        'base_ref: master',
        '',
      ].join('\n'),
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await doctorCommand(tmpDir, { json: true });
      json = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const results = JSON.parse(json).results as Array<{ check: string; status: string }>;
    expect(results.find((result) => result.check === '.zcw.yaml: current-state')).toMatchObject({
      status: 'pass',
    });
  });

  it('only validates top-level keys in .zcw.yaml', async () => {
    const validChangeDir = path.join(tmpDir, 'specs', 'nested-valid');
    await fs.mkdir(validChangeDir, { recursive: true });
    await fs.writeFile(
      path.join(validChangeDir, '.zcw.yaml'),
      [
        'workflow: full',
        'phase: verify',
        'verify_result: pending',
        'archived: false',
        'verification_report:',
        '  nested_key: value',
        '',
      ].join('\n'),
    );

    const invalidChangeDir = path.join(tmpDir, 'specs', 'top-level-invalid');
    await fs.mkdir(invalidChangeDir, { recursive: true });
    await fs.writeFile(
      path.join(invalidChangeDir, '.zcw.yaml'),
      [
        'workflow: full',
        'phase: verify',
        'unknown_root_field: true',
        '',
      ].join('\n'),
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await doctorCommand(tmpDir, { json: true });
      json = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const results = JSON.parse(json).results as Array<{ check: string; status: string; message: string }>;

    expect(results.find((result) => result.check === '.zcw.yaml: nested-valid')).toMatchObject({
      status: 'pass',
    });

    expect(results.find((result) => result.check === '.zcw.yaml: top-level-invalid')).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('unknown_root_field'),
    });
  });

  it('reports missing referenced skill documents in installed skills', async () => {
    const skillDir = path.join(tmpDir, '.claude', 'skills');
    await fs.mkdir(path.join(skillDir, 'zcw-build'), { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'zcw-build', 'SKILL.md'),
      [
        '---',
        'name: zcw-build',
        '---',
        '',
        'Read `zcw/reference/decision-point.md` before continuing.',
        'Read `zcw/reference/missing-contract.md` before continuing.',
        '',
      ].join('\n'),
    );
    await fs.mkdir(path.join(skillDir, 'zcw', 'reference'), { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'zcw', 'reference', 'decision-point.md'),
      '# Decision point\n',
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await doctorCommand(tmpDir, { json: true, scope: 'project' });
      json = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const results = JSON.parse(json).results as Array<{
      check: string;
      status: string;
      message: string;
    }>;

    expect(results.find((result) => result.check === 'skill references: Claude Code (project)')).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('zcw/reference/missing-contract.md'),
    });
  });
});
