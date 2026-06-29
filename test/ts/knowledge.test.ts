import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  addCommand,
  glossaryAddCommand,
  glossaryListCommand,
  harvestCommand,
  loadCommand,
  searchCommand,
  wikiLinkCommand,
} from '../../src/commands/knowledge.js';

describe('ZCW knowledge management', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `zcw-knowledge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('adds and searches local knowhow entries', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await addCommand('kn', 'Phase guard bypass', tmpDir, {
        content: 'Use explicit bypass only for generated files.',
        tag: ['guard,hook'],
        json: true,
      });
      await searchCommand('kn', 'bypass generated', tmpDir, { json: true });
      json = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].entry).toMatchObject({
      kind: 'kn',
      title: 'Phase guard bypass',
      tags: ['guard', 'hook'],
    });
  });

  it('links wiki entries without touching knowhow entries', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await addCommand('wiki', 'Spec Kit', tmpDir, {
        content: 'Specification artifact owner.',
        json: true,
      });
      await addCommand('wiki', 'Superpowers', tmpDir, {
        content: 'Implementation discipline owner.',
        json: true,
      });
      await wikiLinkCommand('Spec Kit', 'Superpowers', tmpDir, {
        relation: 'hands-off-to',
        json: true,
      });
      json = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(json);
    expect(parsed.entry.links).toEqual([
      expect.objectContaining({ relation: 'hands-off-to' }),
    ]);
  });

  it('harvests Spec Kit artifacts into knowhow and loads matching context', async () => {
    const specDir = path.join(tmpDir, 'specs', 'payment-fix');
    await fs.mkdir(specDir, { recursive: true });
    await fs.writeFile(path.join(specDir, 'spec.md'), '# Payment Retry\nNeed retries.\n', 'utf-8');
    await fs.writeFile(path.join(specDir, 'plan.md'), '# Plan\nUse idempotency.\n', 'utf-8');
    await fs.writeFile(path.join(specDir, 'tasks.md'), '- [x] add retry\n', 'utf-8');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await harvestCommand('specs/payment-fix', tmpDir, { json: true });
      await loadCommand(tmpDir, { query: 'idempotency retry', json: true });
      json = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(json);
    expect(parsed.results[0].entry).toMatchObject({
      kind: 'kn',
      title: 'Harvest: Payment Retry',
      sourceSpec: 'specs/payment-fix',
    });
  });

  it('stores glossary terms as tagged wiki entries and loads them by intent', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let listJson = '';
    let loadJson = '';
    try {
      await glossaryAddCommand('Payment Intent', tmpDir, {
        definition: 'A domain concept for a payment authorization attempt.',
        tag: ['payment'],
        json: true,
      });
      await glossaryListCommand(tmpDir, { json: true });
      listJson = log.mock.calls.at(-1)?.join(' ') ?? '';
      await loadCommand(tmpDir, { query: 'payment authorization', json: true });
      loadJson = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const listed = JSON.parse(listJson);
    expect(listed.entries).toHaveLength(1);
    expect(listed.entries[0]).toMatchObject({
      kind: 'wiki',
      title: 'Payment Intent',
      source: 'zcw glossary',
      tags: ['domain', 'glossary', 'payment'],
    });

    const loaded = JSON.parse(loadJson);
    expect(loaded.results[0].entry.title).toBe('Payment Intent');
  });
});
