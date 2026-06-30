import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  issueCloseCommand,
  issueCreateCommand,
  issueDiscoverCommand,
  issueListCommand,
  issueUpdateCommand,
} from '../../src/commands/issues.js';

describe('ZCW issue management', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `zcw-issues-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates, updates, closes, and lists issues from local JSONL storage', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let createdJson = '';
    let updatedJson = '';
    let closedJson = '';
    let activeListJson = '';
    let allListJson = '';

    try {
      await issueCreateCommand(tmpDir, {
        title: 'Missing verify evidence',
        severity: 'high',
        priority: 2,
        tag: ['quality,verify'],
        json: true,
      });
      createdJson = log.mock.calls.at(-1)?.join(' ') ?? '';
      const created = JSON.parse(createdJson);

      await issueUpdateCommand(created.issue.id, tmpDir, {
        status: 'in_progress',
        addTag: ['handoff'],
        note: 'Investigating verification report path.',
        json: true,
      });
      updatedJson = log.mock.calls.at(-1)?.join(' ') ?? '';

      await issueCloseCommand(created.issue.id, tmpDir, {
        resolution: 'Verification report is now required before archive.',
        json: true,
      });
      closedJson = log.mock.calls.at(-1)?.join(' ') ?? '';

      await issueListCommand(tmpDir, { json: true });
      activeListJson = log.mock.calls.at(-1)?.join(' ') ?? '';

      await issueListCommand(tmpDir, { all: true, json: true });
      allListJson = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const created = JSON.parse(createdJson);
    expect(created.issue).toMatchObject({
      title: 'Missing verify evidence',
      severity: 'high',
      priority: 2,
      status: 'open',
      tags: ['quality', 'verify'],
    });

    const updated = JSON.parse(updatedJson);
    expect(updated.issue.status).toBe('in_progress');
    expect(updated.issue.tags).toContain('handoff');
    expect(updated.issue.tags).toContain('quality');
    expect(updated.issue.tags).toContain('verify');
    expect(updated.issue.feedback).toHaveLength(1);

    const closed = JSON.parse(closedJson);
    expect(closed.issue).toMatchObject({
      status: 'completed',
      resolution: 'Verification report is now required before archive.',
    });

    expect(JSON.parse(activeListJson).issues).toHaveLength(0);
    expect(JSON.parse(allListJson).issues).toHaveLength(1);
  });

  it('discovers non-passing quality checks as deduplicated issues', async () => {
    const qualityDir = path.join(tmpDir, '.zcw', 'quality');
    await fs.mkdir(qualityDir, { recursive: true });
    await fs.writeFile(
      path.join(qualityDir, 'audit-latest.json'),
      JSON.stringify(
        {
          kind: 'audit',
          status: 'warn',
          createdAt: '2026-06-29T00:00:00Z',
          projectPath: tmpDir,
          summary: 'audit warn',
          artifacts: {
            latest: path.join(qualityDir, 'audit-latest.json'),
            run: path.join(qualityDir, 'runs', 'audit.json'),
          },
          checks: [
            {
              id: 'session.present',
              status: 'pass',
              message: 'Session exists.',
            },
            {
              id: 'change.active',
              status: 'warn',
              message: 'No active Spec Kit change found.',
              detail: 'specs/demo/.zcw.yaml',
            },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let firstJson = '';
    let secondJson = '';
    try {
      await issueDiscoverCommand(tmpDir, { json: true });
      firstJson = log.mock.calls.at(-1)?.join(' ') ?? '';
      await issueDiscoverCommand(tmpDir, { json: true });
      secondJson = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const first = JSON.parse(firstJson);
    expect(first.created).toHaveLength(1);
    expect(first.created[0]).toMatchObject({
      title: 'audit: change.active',
      source: 'audit',
      severity: 'medium',
      description: 'No active Spec Kit change found.',
    });

    const second = JSON.parse(secondJson);
    expect(second.created).toHaveLength(0);
    expect(second.existing).toHaveLength(1);
    expect(second.existing[0].id).toBe(first.created[0].id);
  });
});
