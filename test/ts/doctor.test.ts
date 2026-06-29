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
        'build_mode: executing-plans',
        'isolation: branch',
        'verify_mode: full',
        'verify_result: pending',
        'design_doc: specs/current-state/plan.md',
        'plan: specs/current-state/tasks.md',
        'verification_report: specs/current-state/.zcw/verify-result.md',
        'branch_status: handled',
        'verified_at: null',
        'archived: false',
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
});
