import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { analyzeCommand, executeCommand, planCommand } from '../../src/commands/pipeline.js';
import { addKnowledgeEntry } from '../../src/core/knowledge.js';

describe('ZCW analyze-plan-execute pipeline', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `zcw-pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates an analysis artifact with knowledge and Superpowers bindings', async () => {
    await addKnowledgeEntry(tmpDir, {
      kind: 'kn',
      title: 'Payment retry pattern',
      content: 'Payment retry work should preserve idempotency keys.',
      tags: ['payment'],
    });

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await analyzeCommand('fix payment retry bug', tmpDir, { json: true });
      json = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(json);
    expect(parsed.analysis).toMatchObject({
      intent: 'fix payment retry bug',
      taskType: 'hotfix',
      scopeVerdict: 'small',
    });
    expect(parsed.analysis.knowledgeContext.entries).toHaveLength(1);
    expect(
      parsed.analysis.superpowers.map((binding: { skill: string }) => binding.skill),
    ).toContain('systematic-debugging');
    await expect(fs.stat(parsed.analysis.artifacts.json)).resolves.toBeDefined();
    await expect(fs.stat(parsed.analysis.artifacts.markdown)).resolves.toBeDefined();
  });

  it('creates a plan from analysis and binds execution to Superpowers', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let analysisJson = '';
    let planJson = '';
    try {
      await analyzeCommand('build a multi-module billing workflow', tmpDir, { json: true });
      analysisJson = log.mock.calls.at(-1)?.join(' ') ?? '';
      const analysis = JSON.parse(analysisJson).analysis;

      await planCommand(tmpDir, {
        from: analysis.id,
        executionMode: 'subagent-driven-development',
        tddMode: 'tdd',
        reviewMode: 'thorough',
        json: true,
      });
      planJson = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(planJson);
    expect(parsed.plan).toMatchObject({
      executionMode: 'subagent-driven-development',
      tddMode: 'tdd',
      reviewMode: 'thorough',
    });
    expect(
      parsed.plan.tasks.map((task: { superpowersSkill?: string }) => task.superpowersSkill),
    ).toEqual(
      expect.arrayContaining([
        'brainstorming',
        'writing-plans',
        'subagent-driven-development',
        'test-driven-development',
      ]),
    );
    const markdown = await fs.readFile(parsed.plan.artifacts.markdown, 'utf-8');
    expect(markdown).toContain('Superpowers Contract');
    expect(markdown).toContain('subagent-driven-development');
  });

  it('creates execution tracking from a plan artifact', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let planJson = '';
    let executionJson = '';
    try {
      await planCommand(tmpDir, {
        intent: 'add audit dashboard',
        executionMode: 'executing-plans',
        tddMode: 'direct',
        reviewMode: 'standard',
        json: true,
      });
      planJson = log.mock.calls.at(-1)?.join(' ') ?? '';
      const plan = JSON.parse(planJson).plan;

      await executeCommand(tmpDir, { from: plan.id, json: true });
      executionJson = log.mock.calls.at(-1)?.join(' ') ?? '';
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(executionJson);
    expect(parsed.execution).toMatchObject({
      planId: JSON.parse(planJson).plan.id,
      status: 'ready',
    });
    expect(parsed.execution.steps[0].command).toBe('/zcw-open');
    expect(
      parsed.execution.superpowers.map((binding: { skill: string }) => binding.skill),
    ).toContain('executing-plans');
    await expect(fs.stat(parsed.execution.artifacts.markdown)).resolves.toBeDefined();
  });
});
