import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  getAssetsDir,
  readManifest,
  getManifestSkills,
  createWorkingDirs,
  copyZCWSkillsForPlatform,
  installZCWHooksForPlatform,
} from '../../src/core/skills.js';
import type { Platform } from '../../src/core/platforms.js';

describe('skills', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `zcw-skills-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('getAssetsDir', () => {
    it('returns a path ending with assets', () => {
      const assetsDir = getAssetsDir();
      expect(path.basename(assetsDir)).toBe('assets');
    });
  });

  describe('readManifest', () => {
    it('reads and parses the manifest.json', async () => {
      const manifest = await readManifest();
      expect(manifest).toHaveProperty('version');
      expect(manifest).toHaveProperty('skills');
      expect(Array.isArray(manifest.skills)).toBe(true);
      expect(manifest.skills.length).toBeGreaterThan(0);
      expect(manifest).not.toHaveProperty('languages');
    });
  });

  describe('getManifestSkills', () => {
    it('returns the skills array from manifest', async () => {
      const skills = await getManifestSkills();
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.some((s) => s.includes('zcw/SKILL.md'))).toBe(true);
    });
  });

  describe('createWorkingDirs', () => {
    it('creates Spec Kit and ZCW working directories', async () => {
      await createWorkingDirs(tmpDir);

      const specsDir = path.join(tmpDir, 'specs');
      const configPath = path.join(tmpDir, '.zcw', 'config.yaml');

      await expect(fs.stat(specsDir)).resolves.toBeDefined();
      await expect(fs.stat(configPath)).resolves.toBeDefined();
    });

    it('does not throw when directories already exist', async () => {
      await createWorkingDirs(tmpDir);
      await expect(createWorkingDirs(tmpDir)).resolves.not.toThrow();
    });
  });

  describe('copyZCWSkillsForPlatform', () => {
    const mockPlatform: Platform = {
      id: 'claude',
      name: 'Claude Code',
      skillsDir: '.claude',
      specKitIntegrationId: 'claude',
    };

    it('copies skill files from assets to platform skills directory', async () => {
      const result = await copyZCWSkillsForPlatform(tmpDir, mockPlatform, false);
      expect(result.copied).toBeGreaterThan(0);
      expect(result.skipped).toBe(0);

      // Verify a key file was copied
      const zcwSkillPath = path.join(tmpDir, '.claude', 'skills', 'zcw', 'SKILL.md');
      expect(await fileExists(zcwSkillPath)).toBe(true);
    });

    it('skips existing files when overwrite is false', async () => {
      // First copy
      await copyZCWSkillsForPlatform(tmpDir, mockPlatform, false);
      // Second copy should skip all
      const result = await copyZCWSkillsForPlatform(tmpDir, mockPlatform, false);
      expect(result.copied).toBe(0);
      expect(result.skipped).toBeGreaterThan(0);
    });

    it('overwrites existing files when overwrite is true', async () => {
      await copyZCWSkillsForPlatform(tmpDir, mockPlatform, false);
      const result = await copyZCWSkillsForPlatform(tmpDir, mockPlatform, true);
      expect(result.copied).toBeGreaterThan(0);
    });

    it('falls back to English skills when a legacy Chinese skills directory is requested', async () => {
      const result = await copyZCWSkillsForPlatform(tmpDir, mockPlatform, false, 'skills-zh');
      expect(result.copied).toBeGreaterThan(0);

      const manifest = await readManifest();
      for (const skillRelPath of manifest.skills) {
        const copiedPath = path.join(tmpDir, '.claude', 'skills', skillRelPath);
        expect(
          await fileExists(copiedPath),
          `legacy zh install should include English ${skillRelPath}`,
        ).toBe(true);
      }
      await expect(
        fs.readFile(path.join(tmpDir, '.claude', 'skills', 'zcw-open', 'SKILL.md'), 'utf-8'),
      ).resolves.toContain('# ZCW Phase 1: Open');
    });

    it('creates OpenCode slash commands for copied ZCW skills', async () => {
      const opencodePlatform: Platform = {
        id: 'opencode',
        name: 'OpenCode',
        skillsDir: '.opencode',
        globalSkillsDir: '.config/opencode',
        specKitIntegrationId: 'opencode',
      };

      const result = await copyZCWSkillsForPlatform(tmpDir, opencodePlatform, false);

      expect(result.copied).toBeGreaterThan(0);
      const commandPath = path.join(tmpDir, '.opencode', 'commands', 'zcw-open.md');
      const command = await fs.readFile(commandPath, 'utf-8');

      expect(command).toContain('description: Run the zcw-open Zen Flow workflow');
      expect(command).toContain('Equivalent Zen Flow skill: `zcw-open`');
      expect(command).toContain(
        'Use the invocation arguments below as the user input for this workflow:',
      );
      expect(command).toContain('$ARGUMENTS');
      expect(command).toContain('# ZCW Phase 1: Open');
      expect(command).toContain('## Steps');
      expect(command).toContain('"$ZCW_BASH" "$ZCW_STATE" init <name> full');
      expect(command).not.toContain('Immediately load the `zcw-open` skill with the skill tool');
      expect(path.basename(commandPath)).toBe('zcw-open.md');
    });

    it('creates OpenCode slash commands from English skill content for legacy zh requests', async () => {
      const opencodePlatform: Platform = {
        id: 'opencode',
        name: 'OpenCode',
        skillsDir: '.opencode',
        globalSkillsDir: '.config/opencode',
        specKitIntegrationId: 'opencode',
      };

      await copyZCWSkillsForPlatform(tmpDir, opencodePlatform, false, 'skills-zh');

      const commandPath = path.join(tmpDir, '.opencode', 'commands', 'zcw-open.md');
      const command = await fs.readFile(commandPath, 'utf-8');

      expect(command).toContain('description: Run the zcw-open Zen Flow workflow');
      expect(command).toContain('Equivalent Zen Flow skill: `zcw-open`');
      expect(command).toContain('# ZCW Phase 1: Open');
      expect(command).toContain('## Steps');
      expect(command).not.toContain('# ZCW 阶段 1：开启（Open）');
      expect(path.basename(commandPath)).toBe('zcw-open.md');
    });

    it('creates OpenCode slash commands in the global OpenCode config directory', async () => {
      const opencodePlatform: Platform = {
        id: 'opencode',
        name: 'OpenCode',
        skillsDir: '.opencode',
        globalSkillsDir: '.config/opencode',
        specKitIntegrationId: 'opencode',
      };

      await copyZCWSkillsForPlatform(tmpDir, opencodePlatform, false, 'skills', 'global');

      await expect(
        fs.access(path.join(tmpDir, '.config', 'opencode', 'commands', 'zcw.md')),
      ).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(tmpDir, '.opencode', 'commands', 'zcw.md')),
      ).rejects.toThrow();
    });
  });

  describe('installZCWHooksForPlatform', () => {
    const staleZCWCommand = 'bash .legacy/skills/zcw/scripts/zcw-hook-guard.sh';
    const currentZCWScript = 'zcw/scripts/zcw-hook-guard.sh';

    it('merges Claude-style hooks into an existing matcher group without replacing user hooks', async () => {
      const platform: Platform = {
        id: 'claude',
        name: 'Claude Code',
        skillsDir: '.claude',
        specKitIntegrationId: 'claude',
        supportsHooks: true,
        hookFormat: 'claude-code',
      };
      const settingsPath = path.join(tmpDir, '.claude', 'settings.local.json');
      const initialSettings = {
        model: 'sonnet',
        hooks: {
          PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo post' }] }],
          PreToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [
                { type: 'command', command: 'echo user-write-check' },
                { type: 'command', command: staleZCWCommand },
              ],
            },
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'echo user-bash-check' }],
            },
          ],
        },
      };
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify(initialSettings), 'utf-8');

      await installZCWHooksForPlatform(tmpDir, platform);
      const firstInstall = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      const writeGroup = firstInstall.hooks.PreToolUse.find(
        (entry: { matcher: string }) => entry.matcher === 'Write|Edit',
      );

      expect(firstInstall.model).toBe('sonnet');
      expect(firstInstall.hooks.PostToolUse).toEqual(initialSettings.hooks.PostToolUse);
      expect(firstInstall.hooks.PreToolUse).toHaveLength(2);
      expect(writeGroup.hooks).toEqual([
        { type: 'command', command: 'echo user-write-check' },
        {
          type: 'command',
          command: `bash .claude/skills/${currentZCWScript}`,
        },
      ]);

      await installZCWHooksForPlatform(tmpDir, platform);
      const secondInstall = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      expect(secondInstall).toEqual(firstInstall);
    });

    it('does not throw when an existing hook group is malformed (non-array)', async () => {
      // Hand-edited settings may store a hook group as an object/scalar rather
      // than an array; install must coerce it instead of throwing.
      const platform: Platform = {
        id: 'claude',
        name: 'Claude Code',
        skillsDir: '.claude',
        specKitIntegrationId: 'claude',
        supportsHooks: true,
        hookFormat: 'claude-code',
      };
      const settingsPath = path.join(tmpDir, '.claude', 'settings.local.json');
      const malformedSettings = {
        hooks: {
          PreToolUse: { matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'echo x' }] },
        },
      };
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify(malformedSettings), 'utf-8');

      await expect(installZCWHooksForPlatform(tmpDir, platform)).resolves.toEqual({
        installed: true,
      });

      const updated = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      expect(updated.hooks.PreToolUse).toHaveLength(1);
      expect(updated.hooks.PreToolUse[0].matcher).toBe('Write|Edit');
    });

    it.each([
      { id: 'qwen', skillsDir: '.qwen', hookFormat: 'qwen' as const },
      { id: 'qoder', skillsDir: '.qoder', hookFormat: 'qoder' as const },
    ])(
      'merges $id hooks into the existing matcher group idempotently',
      async ({ id, skillsDir, hookFormat }) => {
        const platform: Platform = {
          id,
          name: id,
          skillsDir,
          specKitIntegrationId: id,
          supportsHooks: true,
          hookFormat,
        };
        const settingsPath = path.join(tmpDir, skillsDir, 'settings.json');
        const initialSettings = {
          theme: 'dark',
          hooks: {
            AfterTool: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo after' }] }],
            PreToolUse: [
              {
                matcher: 'Write|Edit',
                hooks: [
                  {
                    type: 'command',
                    command: 'echo user-write-check',
                    description: 'User write check',
                  },
                  {
                    type: 'command',
                    command: staleZCWCommand,
                    description: 'Old ZCW hook',
                  },
                ],
              },
            ],
          },
        };
        await fs.mkdir(path.dirname(settingsPath), { recursive: true });
        await fs.writeFile(settingsPath, JSON.stringify(initialSettings), 'utf-8');

        await installZCWHooksForPlatform(tmpDir, platform);
        const firstInstall = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));

        expect(firstInstall.theme).toBe('dark');
        expect(firstInstall.hooks.AfterTool).toEqual(initialSettings.hooks.AfterTool);
        expect(firstInstall.hooks.PreToolUse).toHaveLength(1);
        expect(firstInstall.hooks.PreToolUse[0].hooks).toEqual([
          {
            type: 'command',
            command: 'echo user-write-check',
            description: 'User write check',
          },
          {
            type: 'command',
            command: `bash ${skillsDir}/skills/${currentZCWScript}`,
            description: 'Block code writes in wrong Zen Flow phase (open/design/archive)',
          },
        ]);

        await installZCWHooksForPlatform(tmpDir, platform);
        const secondInstall = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
        expect(secondInstall).toEqual(firstInstall);
      },
    );

    it('merges Gemini hooks into the existing matcher group idempotently', async () => {
      const platform: Platform = {
        id: 'gemini',
        name: 'Gemini CLI',
        skillsDir: '.gemini',
        specKitIntegrationId: 'gemini',
        supportsHooks: true,
        hookFormat: 'gemini',
      };
      const settingsPath = path.join(tmpDir, '.gemini', 'settings.json');
      const initialSettings = {
        selectedAuthType: 'oauth',
        hooks: {
          AfterTool: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo after' }] }],
          BeforeTool: [
            {
              matcher: 'write_file|edit_file',
              hooks: [
                {
                  type: 'command',
                  command: 'echo user-write-check',
                  name: 'User write check',
                },
                {
                  type: 'command',
                  command: staleZCWCommand,
                  name: 'Old ZCW hook',
                },
              ],
            },
          ],
        },
      };
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify(initialSettings), 'utf-8');

      await installZCWHooksForPlatform(tmpDir, platform);
      const firstInstall = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));

      expect(firstInstall.selectedAuthType).toBe('oauth');
      expect(firstInstall.hooks.AfterTool).toEqual(initialSettings.hooks.AfterTool);
      expect(firstInstall.hooks.BeforeTool).toHaveLength(1);
      expect(firstInstall.hooks.BeforeTool[0].hooks).toEqual([
        {
          type: 'command',
          command: 'echo user-write-check',
          name: 'User write check',
        },
        {
          type: 'command',
          command: `bash .gemini/skills/${currentZCWScript}`,
          name: 'Block code writes in wrong Zen Flow phase (open/design/archive)',
        },
      ]);

      await installZCWHooksForPlatform(tmpDir, platform);
      const secondInstall = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      expect(secondInstall).toEqual(firstInstall);
    });

    it('replaces only managed Windsurf hooks and preserves user hooks idempotently', async () => {
      const platform: Platform = {
        id: 'windsurf',
        name: 'Windsurf',
        skillsDir: '.windsurf',
        specKitIntegrationId: 'windsurf',
        supportsHooks: true,
        hookFormat: 'windsurf',
      };
      const hooksPath = path.join(tmpDir, '.windsurf', 'hooks.json');
      const initialHooks = {
        enabled: true,
        hooks: {
          post_write_code: [{ command: 'echo post', show_output: false }],
          pre_write_code: [
            { command: 'echo user-write-check', show_output: false },
            { command: staleZCWCommand, show_output: true },
          ],
        },
      };
      await fs.mkdir(path.dirname(hooksPath), { recursive: true });
      await fs.writeFile(hooksPath, JSON.stringify(initialHooks), 'utf-8');

      await installZCWHooksForPlatform(tmpDir, platform);
      const firstInstall = JSON.parse(await fs.readFile(hooksPath, 'utf-8'));

      expect(firstInstall.enabled).toBe(true);
      expect(firstInstall.hooks.post_write_code).toEqual(initialHooks.hooks.post_write_code);
      expect(firstInstall.hooks.pre_write_code).toEqual([
        { command: 'echo user-write-check', show_output: false },
        {
          command: `bash .windsurf/skills/${currentZCWScript}`,
          show_output: true,
        },
      ]);

      await installZCWHooksForPlatform(tmpDir, platform);
      const secondInstall = JSON.parse(await fs.readFile(hooksPath, 'utf-8'));
      expect(secondInstall).toEqual(firstInstall);
    });
  });

  describe('English Zen Flow workflow safeguards', () => {
    it('keeps the English workflow decision-point requirements', async () => {
      const enZCW = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'SKILL.md'),
        'utf-8',
      );
      const enOpen = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw-open', 'SKILL.md'),
        'utf-8',
      );
      const enDesign = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw-design', 'SKILL.md'),
        'utf-8',
      );
      const enBuild = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw-build', 'SKILL.md'),
        'utf-8',
      );
      const enVerify = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw-verify', 'SKILL.md'),
        'utf-8',
      );
      const enArchive = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw-archive', 'SKILL.md'),
        'utf-8',
      );
      const enHotfix = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw-hotfix', 'SKILL.md'),
        'utf-8',
      );
      const enTweak = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw-tweak', 'SKILL.md'),
        'utf-8',
      );
      const enZCWRule = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'rules', 'zcw-phase-guard.md'),
        'utf-8',
      );
      const enDecisionPoint = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'reference', 'decision-point.md'),
        'utf-8',
      );
      const enDebugGate = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'reference', 'debug-gate.md'),
        'utf-8',
      );

      expect(enZCW).toContain('Decision points are blocking points');
      expect(enDecisionPoint).toContain(
        'If the current platform has no structured question tool, ask clear options in the conversation and stop until the user replies',
      );
      expect(enDecisionPoint).toContain(
        'Never substitute recommendation rules, defaults, historical preferences',
      );
      expect(enOpen).toContain(
        '### 1b. Requirements Clarification Completion Confirmation (Blocking Point)',
      );
      expect(enOpen).toContain(
        'Must not create spec.md, plan.md, or tasks.md before the user confirms requirements clarification is complete',
      );
      expect(enOpen).toContain(
        'Full `/zcw` workflow must not use the Skill tool to load the `speckit-propose` skill',
      );
      expect(enOpen).toContain('`zcw/reference/decision-point.md`');
      expect(enOpen).toContain(
        'After the skill loads, follow its guidance to create the change skeleton, but override its "STOP and wait for user direction" behavior when a confirmed clarification summary from Step 1b is already available in the conversation context',
      );
      expect(enOpen).toContain(
        'The clarification summary must include: goals, non-goals, scope boundaries, key unknowns, and draft acceptance scenarios',
      );
      expect(enDesign).toContain(
        '**Immediately execute:** Use the Skill tool to load the Superpowers `brainstorming` skill. Skipping this step is prohibited.',
      );
      expect(enDesign).toContain(
        'After the skill loads, follow its guidance and use the following context',
      );
      expect(enDesign).not.toContain('ARGUMENTS containing');
      expect(enDesign).toContain(
        'must follow the `zcw/reference/decision-point.md` protocol to pause and wait for the user to explicitly confirm',
      );
      expect(enDesign).toContain(
        'must not weaken the Superpowers `brainstorming` clarification flow by "skipping redundant context exploration"',
      );
      expect(enDesign).not.toContain('Skip redundant context exploration');
      expect(enBuild).toContain(
        'Must not choose `branch` or `worktree` based on recommendation rules',
      );
      expect(enBuild).toContain(
        'must not choose the execution method, TDD mode, or code review mode based on recommendation rules',
      );
      expect(enBuild).toContain('`zcw/reference/decision-point.md`');
      expect(enVerify).toContain(
        'must follow the `zcw/reference/decision-point.md` protocol to pause and wait for the user to decide whether to fix or accept the deviation',
      );
      expect(enVerify).toContain(
        'Must follow the `zcw/reference/decision-point.md` protocol to pause and wait for the user to choose branch handling method',
      );
      expect(enVerify).toContain(
        'Only after the user completes selection and the corresponding operation finishes, may `branch_status: handled` be written',
      );
      expect(enArchive).toContain('### 1. Final Archive Confirmation (Blocking Point)');
      expect(enArchive).toContain(
        'Must not run `"$ZCW_BASH" "$ZCW_ARCHIVE" "<change-name>"` before user confirmation',
      );
      expect(enArchive).toContain('`zcw/reference/decision-point.md`');
      expect(enArchive).toContain('Confirm archive');
      expect(enArchive).toContain('Needs adjustment or re-verification');
      expect(enArchive).toContain('Do not archive yet');
      expect(enArchive).toContain(
        '`"$ZCW_BASH" "$ZCW_STATE" transition <change-name> archive-reopen`',
      );
      expect(enVerify).toContain('Must not automatically archive just because verification passed');
      expect(enHotfix).toContain(
        'must follow the `zcw/reference/decision-point.md` protocol to pause and wait for the user to explicitly confirm',
      );
      expect(enHotfix).toContain('Do not directly enter `/zcw-design`');
      expect(enTweak).toContain(
        'must follow the `zcw/reference/decision-point.md` protocol to pause and wait for the user to explicitly confirm',
      );
      expect(enTweak).toContain('Do not directly enter `/zcw-design`');
      expect(enTweak).toContain('`zcw/reference/debug-gate.md`');
      expect(enZCW).toContain(
        '`verify_result: fail` → Enter verification failure decision blocking point',
      );
      expect(enZCW).not.toContain(
        '`verify_result: fail` → `"$ZCW_BASH" "$ZCW_STATE" transition <name> verify-fail` then `/zcw-build`',
      );

      expect(enHotfix).toContain('handle per "Upgrade Conditions" section');
      expect(enTweak).toContain('handle per upgrade conditions blocking confirmation');
      expect(enHotfix).toContain(
        'verify phase (zcw-verify) verification-failure and branch-handling decisions',
      );
      expect(enTweak).toContain(
        'verify phase (zcw-verify) verification-failure and branch-handling decisions',
      );
      expect(enHotfix).toContain('Final archive confirmation');
      expect(enTweak).toContain('Final archive confirmation');
      expect(enDesign).toContain('The brainstorming phase does not write to the Design Doc file');
      expect(enVerify).toContain(
        "must use the current platform's available user input/confirmation mechanism as a single-select question to pause and wait for the user to choose the handling method",
      );
      expect(enZCW).toContain('first check `build_pause`, `plan`, `build_mode`, and `isolation`');
      expect(enZCW).toContain('`build_pause: plan-ready` and the plan file exists');
      expect(enZCW).toContain(
        '`build_pause` is not an execution method and must not be written to `build_mode`',
      );
      expect(enBuild).toContain('Provide Plan-Ready Pause Point');
      expect(enBuild).toContain(
        'Must not auto-continue and must not write the pause into `build_mode`',
      );
      expect(enBuild).toContain('`build_mode` is `executing-plans`');
      expect(enBuild).toContain(
        'use the Skill tool to load the Superpowers `requesting-code-review` skill',
      );
      expect(enBuild).toContain('request code review at least once');
      expect(enBuild).toContain('build → verify');
      expect(enBuild).toContain(
        'CRITICAL review findings (security vulnerabilities, data loss risk, build/test failures) must be fixed',
      );
      expect(enVerify).toContain('CRITICAL or IMPORTANT failures must be fixed');
      expect(enVerify).toContain('skipping fix to accept all is not allowed');
      expect(enVerify).toContain('Lightweight code review');
      expect(enVerify).toContain(
        'use the Skill tool to load the Superpowers `requesting-code-review` skill',
      );
      expect(enVerify).toContain('checks only correctness, security, and edge cases');
      expect(enVerify).toContain('no CRITICAL or IMPORTANT issues');
      expect(enVerify).toContain(
        'does not perform spec coverage, Design Doc consistency, or drift checks',
      );
      expect(enHotfix).toContain('6 quick checks, including code review strategy');
      expect(enHotfix).toContain('default `review_mode: off`');
      expect(enHotfix).toContain(
        'workspace isolation and execution-method selection when tasks exceed 3 and transfer to `/zcw-build`',
      );
      expect(enBuild).toContain(
        'Must follow the `zcw/reference/decision-point.md` protocol to pause and wait for the user to explicitly choose',
      );
      expect(enBuild).toContain(
        'must follow the `zcw/reference/decision-point.md` protocol to pause and wait for the user to decide whether to split into a new change',
      );
      expect(enVerify).toContain(
        'Implementation matches `specs/<name>/plan.md` high-level design decisions',
      );
      expect(enBuild).toContain('create independent change through `/zcw-open`');
      expect(enBuild).not.toContain('create independent change through `/opsx:new`');
      expect(enOpen).toContain('### 1a. PRD Split Preflight (Blocking Point)');
      expect(enOpen).toContain('Create multiple Spec Kit changes');
      expect(enOpen).toContain('Keep everything as one change');
      expect(enOpen).toContain('Adjust the split plan before continuing');
      expect(enOpen).toContain(
        'Every accepted split item must be created as an independent change through `/zcw-open`',
      );
      expect(enOpen).not.toContain(
        'Every accepted split item must be created as an independent change through `/opsx:new`',
      );
      expect(enOpen).toContain('confirmed split item');
      expect(enOpen).toContain('skip the PRD split preflight');
      expect(enOpen).toContain(
        'In batch split mode, a single split item must not auto-advance to `/zcw-design` after completing the open phase',
      );
      expect(enOpen).toContain(
        'After splitting is complete, must pause and ask the user which change to start',
      );
      expect(enOpen).toContain('On resume, first check already-created active changes');
      expect(enZCW).toContain(
        'Build phase scope expansion requiring redesign or new change split',
      );
      expect(enZCW).toContain(
        'Archive phase final confirmation before running the archive script',
      );
      expect(enZCW).toContain(
        'Open phase large PRD requiring confirmation to split into multiple changes',
      );
      expect(enVerify).toContain('Option A is a verify phase allowed artifact');
      expect(enBuild).toContain(
        'Must use the Skill tool to load the Superpowers `using-git-worktrees`',
      );
      expect(enBuild).not.toContain('native `EnterWorktree` tool');
      expect(enBuild).toContain(
        'must use Skill tool to load the Superpowers `brainstorming` skill',
      );
      expect(enDesign).toContain(
        'The script reads the change `.zcw.yaml` `context_compression` snapshot',
      );
      expect(enDesign).toContain('Default `context_compression: off` generates');
      expect(enDesign).toContain('If context_compression is beta, use:');
      expect(enDesign).toContain('specs/<name>/.zcw/handoff/spec-context.md');
      expect(enDesign).toContain('In beta mode, `spec-context.json` must be structurally valid');
      expect(enDesign).toContain('incrementally update `brainstorm-summary.md`');
      expect(enDesign).toContain('### 1e. Active Context Compaction Gate');
      expect(enHotfix).toContain('Immediately use the Skill tool to load the `zcw-design` skill');
      expect(enTweak).toContain('Immediately use the Skill tool to load the `zcw-design` skill');
      expect(enVerify).toContain(
        'After user selects B, run `"$ZCW_BASH" "$ZCW_STATE" transition <change-name> verify-fail`, then invoke `/zcw-build`',
      );

      expect(enBuild).toContain(
        'must use the Skill tool to load the Superpowers `systematic-debugging` skill',
      );
      expect(enBuild).toContain('`zcw/reference/debug-gate.md`');
      expect(enBuild).toContain(
        'a crash, unexpected behavior, test failure, or build failure appears while running the program, tests, build, or manual verification',
      );
      expect(enDebugGate).toContain(
        'first add a minimal failing test that reproduces the crash or unexpected behavior',
      );
      expect(enHotfix).toContain(
        'must use the Skill tool to load the Superpowers `systematic-debugging` skill',
      );
      expect(enHotfix).toContain('`zcw/reference/debug-gate.md`');
      expect(enDebugGate).toContain(
        'do not replace the current change verification loop by starting a separate “write test cases” change',
      );

      expect(
        [enZCW, enOpen, enDesign, enBuild, enVerify, enArchive, enHotfix, enTweak].join('\n'),
      ).not.toContain('AskUserQuestion');
      expect(enZCW).toContain('`zcw/reference/decision-point.md`');
      expect(enZCW).toContain('`auto_transition`');
      expect(enZCW).toContain('does not block phase updates');
      expect(enZCWRule).toContain(
        'brainstorming in progress: incrementally update brainstorm-summary.md',
      );
      expect(enZCWRule).toContain('active compaction gate');
      expect(enZCWRule).toContain(
        'Use the Skill tool to reload the Superpowers `subagent-driven-development` skill',
      );
      expect(enZCWRule).toContain(
        'Re-read `zcw/reference/subagent-dispatch.md` for ZCW-specific extensions',
      );
      expect(enZCWRule).toContain('Do not execute tasks directly in the main session');
      for (const [content] of [
        [enOpen, '/zcw-design'],
        [enDesign, '/zcw-build'],
        [enBuild, '/zcw-verify'],
        [enVerify, '/zcw-archive'],
      ] as const) {
        expect(content).toContain('Automatic Handoff to Next Phase');
        expect(content).toContain('"$ZCW_BASH" "$ZCW_STATE" next <change-name>');
        expect(content).toContain('`NEXT: auto`');
        expect(content).toContain('`NEXT: manual`');
        expect(content).toContain('run `/<SKILL>` manually');
      }
      expect(enHotfix).toContain('Automatic Handoff to Next Phase');
      expect(enHotfix).toContain('"$ZCW_BASH" "$ZCW_STATE" next <name>');
      expect(enHotfix).toContain('`NEXT: auto`');
      expect(enHotfix).toContain(
        '`phase: build` returns `zcw-hotfix`, `verify` returns `zcw-verify`, `archive` returns `zcw-archive`',
      );
      expect(enTweak).toContain('Automatic Handoff to Next Phase');
      expect(enTweak).toContain('"$ZCW_BASH" "$ZCW_STATE" next <name>');
      expect(enTweak).toContain('`NEXT: auto`');
      expect(enTweak).toContain(
        '`phase: build` returns `zcw-tweak`, `verify` returns `zcw-verify`, `archive` returns `zcw-archive`',
      );
    });
  });

  describe('ZCW output language safeguards', () => {
    it('requires Spec Kit and Superpowers outputs to follow the user request language', async () => {
      const skillNames = [
        'zcw',
        'zcw-open',
        'zcw-design',
        'zcw-build',
        'zcw-verify',
        'zcw-archive',
        'zcw-hotfix',
        'zcw-tweak',
      ] as const;

      const readSkills = async () =>
        Object.fromEntries(
          await Promise.all(
            skillNames.map(async (skillName) => [
              skillName,
              await fs.readFile(
                path.resolve('assets', 'skills', skillName, 'SKILL.md'),
                'utf-8',
              ),
            ]),
          ),
        ) as Record<(typeof skillNames)[number], string>;

      const enSkills = await readSkills();

      expect(enSkills.zcw).toContain('Output Language Rule');
      expect(enSkills.zcw).toContain(
        'Use the language of the user request that triggered this workflow as the default output language',
      );
      expect(enSkills['zcw-open']).toContain(
        'Every prompt and artifact request passed to Spec Kit must include the output-language constraint',
      );
      expect(enSkills['zcw-design']).toContain(
        'Language: Use the language of the user request that triggered this workflow',
      );
      expect(enSkills['zcw-build']).toContain(
        'Plan files and execution feedback must use the language of the user request that triggered this workflow',
      );
      expect(enSkills['zcw-build']).toContain(
        'ARGUMENTS must include the same Language constraint as Step 1',
      );
      expect(enSkills['zcw-verify']).toContain(
        'Verification reports and branch-handling notes must use the language of the user request that triggered this workflow',
      );
      expect(enSkills['zcw-archive']).toContain(
        'Archive summaries and lifecycle closure notes must use the language of the user request that triggered this workflow',
      );
      expect(enSkills['zcw-hotfix']).toContain(
        'Streamlined Spec Kit artifacts must use the language of the user request that triggered this workflow',
      );
      expect(enSkills['zcw-tweak']).toContain(
        'Streamlined Spec Kit artifacts must use the language of the user request that triggered this workflow',
      );
    });
  });

  describe('ZCW build subagent dispatch safeguards', () => {
    it('keeps the English dispatch contract behaviorally aligned', async () => {
      const enBuild = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw-build', 'SKILL.md'),
        'utf-8',
      );
      const enDispatch = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'reference', 'subagent-dispatch.md'),
        'utf-8',
      );
      const enRecovery = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'reference', 'context-recovery.md'),
        'utf-8',
      );
      const enGuard = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'rules', 'zcw-phase-guard.md'),
        'utf-8',
      );

      expect(enBuild).toContain(
        'Use the Skill tool to load the Superpowers `subagent-driven-development` skill',
      );
      expect(enBuild).toContain(
        'read `zcw/reference/subagent-dispatch.md` for ZCW-specific extensions',
      );
      expect(enBuild).toContain(
        'TDD constraints and evidence thresholds are defined in `zcw/reference/subagent-dispatch.md`',
      );
      expect(enDispatch).toContain(
        'If the Superpowers skill conflicts with this document, the more specific ZCW constraints here take precedence',
      );
      expect(enDispatch).toContain('Never bundle multiple tasks into one agent');
      expect(enDispatch).toContain('fresh background implementer agent for every task');
      expect(enDispatch).toContain('fix agents, and the final reviewer');
      expect(enDispatch).toContain(
        'Language: Use the language of the user request that triggered this workflow',
      );
      expect(enDispatch).toContain('allowed file scope');
      expect(enDispatch).toContain('required test commands');
      expect(enDispatch).toContain('commit hash');
      expect(enDispatch).toContain('verify that the commit and changed files are visible');
      expect(enDispatch).toContain('implementation commit or diff and the RED/GREEN evidence');
      expect(enDispatch).toContain('The coordinator may modify only');
      expect(enDispatch).toContain('plan, Spec Kit task, and subagent progress checkpoint');
      expect(enDispatch).toContain('specs/<name>/.zcw/subagent-progress.md');
      expect(enDispatch).toContain('final-review | final-fix');
      expect(enDispatch).toContain('current review-fix round');
      expect(enDispatch).toContain('review stages already passed');
      expect(enDispatch).toContain(
        'all tasks are checked and the checkpoint stage is `final-review` or `final-fix`',
      );
      expect(enDispatch).toContain(
        'use the Skill tool to load the Superpowers `test-driven-development` skill',
      );
      expect(enDispatch).toContain(
        'When `review_mode: standard`, do not automatically dispatch per-task reviewers',
      );
      expect(enDispatch).toContain('When `review_mode: thorough`, do not run per-task dual review');
      expect(enDispatch).toContain('When `review_mode: off`');
      expect(enDispatch).toContain('Do NOT summarize');
      expect(enDispatch).toContain('irreducible ambiguity');
      expect(enDispatch).toContain('real background agent dispatch capability');
      expect(enDispatch).toContain('must not load `finishing-a-development-branch`');
      expect(enDispatch).toContain(
        'return control to `zcw-build` for exit checks, the phase guard, and phase handoff',
      );
      expect(enRecovery).toContain('reload the Superpowers `subagent-driven-development` skill');
      expect(enRecovery).toContain('Re-read `zcw/reference/subagent-dispatch.md`');
      expect(enRecovery).toContain('Read `specs/<name>/.zcw/subagent-progress.md`');
      expect(enGuard).toContain('reload the Superpowers `subagent-driven-development` skill');
      expect(enGuard).toContain(
        'Re-read `zcw/reference/subagent-dispatch.md` for ZCW-specific extensions',
      );
      expect(enGuard).toContain('Read `specs/<name>/.zcw/subagent-progress.md`');
    });

    it('does not install a Stop hook for task continuity', async () => {
      const manifest = await readManifest();
      const hooks = Object.values(manifest.hooks ?? {});

      expect(hooks.length).toBeGreaterThan(0);
      expect(hooks.every((hook) => hook.matcher === 'Write|Edit')).toBe(true);
      expect(hooks.some((hook) => /stop/i.test(hook.matcher))).toBe(false);
    });
  });

  describe('ZCW phase guard rules', () => {
    const section = (content: string, heading: string) => {
      const start = content.indexOf(heading);
      expect(start).toBeGreaterThanOrEqual(0);
      const rest = content.slice(start + heading.length);
      const nextHeading = rest.search(/\n## /u);
      return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
    };

    it('delegates post-guard handoff to zcw-state next so auto_transition is honored', async () => {
      const enGuard = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'rules', 'zcw-phase-guard.md'),
        'utf-8',
      );

      const enSection = section(enGuard, '## Automatic Transition After Phase Exit');
      expect(enSection).toContain('zcw-state next <change-name>');
      expect(enSection).toContain('NEXT: auto');
      expect(enSection).toContain('NEXT: manual');
      expect(enSection).toContain('NEXT: done');
      expect(enSection).not.toContain("must invoke the next phase's skill");
      expect(enSection).not.toContain('open → `zcw-design`');
      expect(enGuard).not.toContain('## 阶段退出后自动过渡');
    });
  });

  describe('Repository authoring guidance', () => {
    it('documents consistent skill invocation wording in CLAUDE.md', async () => {
      const claude = await fs.readFile(path.resolve('CLAUDE.md'), 'utf-8');

      expect(claude).toContain('## Skill 触发表述规范');
      expect(claude).toContain(
        '中文统一使用：`**立即执行：** 使用 Skill 工具加载 <skill-name> 技能。禁止跳过此步骤。`',
      );
      expect(claude).toContain(
        '英文统一使用：`**Immediately execute:** Use the Skill tool to load the <skill-name> skill. Skipping this step is prohibited.`',
      );
      expect(claude).toContain(
        '后续输入、上下文或执行要求写在“技能加载后 / After the skill loads”段落',
      );
    });
  });

  describe('ZCW script discovery helper', () => {
    it('ships a shared script locator helper', async () => {
      const manifest = await readManifest();
      expect(manifest.skills).toContain('zcw/scripts/zcw-env.sh');
    });

    it('keeps review_mode wired through state and schema scripts', async () => {
      const stateScript = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'scripts', 'zcw-state.sh'),
        'utf-8',
      );
      const guardScript = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'scripts', 'zcw-guard.sh'),
        'utf-8',
      );
      const validateScript = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'scripts', 'zcw-yaml-validate.sh'),
        'utf-8',
      );

      expect(stateScript).toContain('review_mode: $review_mode');
      expect(stateScript).toContain('review_mode)');
      expect(stateScript).toContain('validate_enum "$value" "off" "standard" "thorough"');
      expect(stateScript).toContain('review_mode must be selected before leaving build');
      expect(guardScript).toContain('review_mode_selected()');
      expect(guardScript).toContain('check "review_mode selected" review_mode_selected');
      expect(validateScript).toContain('review_mode=$(field_value "review_mode")');
      expect(validateScript).toContain(
        'validate_enum "review_mode"   "$review_mode"    "off standard thorough"',
      );
      expect(validateScript).toContain('tdd_mode review_mode isolation');
    });

    it('keeps platform search roots out of English skill prose', async () => {
      const manifest = await readManifest();
      const skillPaths = manifest.skills.filter(
        (skillPath) =>
          skillPath.endsWith('SKILL.md') &&
          (skillPath === 'zcw/SKILL.md' || skillPath.startsWith('zcw-')),
      );

      for (const languageDir of ['skills']) {
        for (const skillPath of skillPaths) {
          const content = await fs.readFile(
            path.resolve('assets', languageDir, skillPath),
            'utf-8',
          );
          if (!content.includes('ZCW_STATE') && !content.includes('ZCW_GUARD')) continue;

          expect(content, `${languageDir}/${skillPath} should use zcw-env.sh`).toContain(
            'zcw-env.sh',
          );
          expect(content, `${languageDir}/${skillPath} should source ZCW_ENV`).toContain(
            '. "$ZCW_ENV"',
          );
          expect(
            content,
            `${languageDir}/${skillPath} should allow HOME skill glob expansion`,
          ).toContain('"$HOME"/.*/skills');
          expect(
            content,
            `${languageDir}/${skillPath} should not quote the HOME skill glob`,
          ).not.toContain('"$HOME/.*/skills"');
          expect(content, `${languageDir}/${skillPath} should not inline roots`).not.toContain(
            'ZCW_SEARCH_ROOTS=',
          );
        }
      }
    });

    it('uses ZCW_BASH in shipped ZCW command examples', async () => {
      const manifest = await readManifest();
      const skillPaths = manifest.skills.filter(
        (skillPath) =>
          skillPath.endsWith('SKILL.md') &&
          (skillPath === 'zcw/SKILL.md' || skillPath.startsWith('zcw-')),
      );

      for (const languageDir of ['skills']) {
        for (const skillPath of skillPaths) {
          const content = await fs.readFile(
            path.resolve('assets', languageDir, skillPath),
            'utf-8',
          );

          expect(
            content,
            `${languageDir}/${skillPath} should avoid raw bash for ZCW scripts`,
          ).not.toMatch(/(^|[` \t])bash[ \t]+"?\$ZCW_/m);
        }
      }
    });

    it('keeps the ZCW_ENV locator block identical across shipped skills', async () => {
      const manifest = await readManifest();
      const skillPaths = manifest.skills.filter(
        (skillPath) =>
          skillPath.endsWith('SKILL.md') &&
          (skillPath === 'zcw/SKILL.md' || skillPath.startsWith('zcw-')),
      );

      const extractLocatorBlock = (content: string) => {
        const start = content.indexOf('ZCW_ENV="${ZCW_ENV:-$(find .');
        const end = content.indexOf('. "$ZCW_ENV"');

        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);

        return content.slice(start, end + '. "$ZCW_ENV"'.length);
      };

      for (const languageDir of ['skills']) {
        let baseline: string | null = null;

        for (const skillPath of skillPaths) {
          const content = await fs.readFile(
            path.resolve('assets', languageDir, skillPath),
            'utf-8',
          );
          if (!content.includes('ZCW_ENV="${ZCW_ENV:-$(find .')) continue;

          const locatorBlock = extractLocatorBlock(content);
          if (baseline === null) {
            baseline = locatorBlock;
            continue;
          }

          expect(
            locatorBlock,
            `${languageDir}/${skillPath} should reuse the shared locator block`,
          ).toBe(baseline);
        }
      }
    });

    it('ships every zcw reference doc that skill prose points to', async () => {
      const manifest = await readManifest();
      const manifestSkills = new Set(manifest.skills);
      const skillPaths = manifest.skills.filter(
        (skillPath) =>
          skillPath.endsWith('SKILL.md') &&
          (skillPath === 'zcw/SKILL.md' || skillPath.startsWith('zcw-')),
      );

      for (const languageDir of ['skills']) {
        for (const skillPath of skillPaths) {
          const content = await fs.readFile(
            path.resolve('assets', languageDir, skillPath),
            'utf-8',
          );
          const references = content.match(/zcw\/reference\/[a-z-]+\.md/g) ?? [];

          for (const referencePath of new Set(references)) {
            expect(
              manifestSkills.has(referencePath),
              `${languageDir}/${skillPath} references ${referencePath} but manifest.json does not ship it`,
            ).toBe(true);
          }
        }
      }
    });
  });

  describe('Superpowers skill invocation names', () => {
    it('uses installed bare Superpowers skill names instead of plugin-prefixed aliases', async () => {
      const manifest = await readManifest();
      const skillPaths = manifest.skills.filter(
        (skillPath) =>
          skillPath.endsWith('SKILL.md') &&
          (skillPath === 'zcw/SKILL.md' || skillPath.startsWith('zcw-')),
      );

      for (const languageDir of ['skills']) {
        for (const skillPath of skillPaths) {
          const content = await fs.readFile(
            path.resolve('assets', languageDir, skillPath),
            'utf-8',
          );
          expect(content, `${languageDir}/${skillPath} should use bare skill names`).not.toContain(
            'superpowers:',
          );
        }
      }
    });
  });
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
