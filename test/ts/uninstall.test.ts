import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

import { PLATFORMS, type Platform } from '../../src/core/platforms.js';
import {
  removeZCWSkillsForPlatform,
  removeZCWRulesForPlatform,
  removeZCWHooksForPlatform,
  removeWorkingDirs,
} from '../../src/core/uninstall.js';
import {
  copyZCWSkillsForPlatform,
  copyZCWRulesForPlatform,
  installZCWHooksForPlatform,
} from '../../src/core/skills.js';
import { fileExists, removeFile, removeDir, isDirEmpty } from '../../src/utils/file-system.js';

describe('uninstall', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `zcw-uninstall-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('file-system utilities', () => {
    describe('removeFile', () => {
      it('removes an existing file and returns true', async () => {
        const filePath = path.join(tmpDir, 'test.txt');
        await fs.writeFile(filePath, 'hello', 'utf-8');
        expect(await fileExists(filePath)).toBe(true);

        const result = await removeFile(filePath);
        expect(result).toBe(true);
        expect(await fileExists(filePath)).toBe(false);
      });

      it('returns false for non-existent file', async () => {
        const result = await removeFile(path.join(tmpDir, 'nope.txt'));
        expect(result).toBe(false);
      });
    });

    describe('removeDir', () => {
      it('removes an existing directory and returns true', async () => {
        const dirPath = path.join(tmpDir, 'subdir');
        await fs.mkdir(dirPath, { recursive: true });
        await fs.writeFile(path.join(dirPath, 'file.txt'), 'data', 'utf-8');

        const result = await removeDir(dirPath);
        expect(result).toBe(true);
        expect(await fileExists(dirPath)).toBe(false);
      });

      it('returns true for non-existent directory (force mode)', async () => {
        // fs.rm with { force: true } succeeds even if path doesn't exist
        const result = await removeDir(path.join(tmpDir, 'nope'));
        expect(result).toBe(true);
      });

      it('removes a symlinked directory without deleting its target', async () => {
        if (process.platform === 'win32') return; // requires elevated permissions
        // Data-safety: a symlinked skills/rules/hooks dir must be unlinked in
        // place, never recursively removed through to its resolved target.
        const realDir = path.join(tmpDir, 'real-target');
        const realFile = path.join(realDir, 'keep-me.txt');
        await fs.mkdir(realDir, { recursive: true });
        await fs.writeFile(realFile, 'data', 'utf-8');

        const symlinkDir = path.join(tmpDir, 'skills-symlink');
        await fs.symlink(realDir, symlinkDir, 'dir');

        const result = await removeDir(symlinkDir);

        expect(result).toBe(true);
        expect(await fileExists(symlinkDir)).toBe(false);
        expect(await fileExists(realDir)).toBe(true);
        expect(await fileExists(realFile)).toBe(true);
      });
    });

    describe('isDirEmpty', () => {
      it('returns true for empty directory', async () => {
        const dirPath = path.join(tmpDir, 'empty');
        await fs.mkdir(dirPath, { recursive: true });
        expect(await isDirEmpty(dirPath)).toBe(true);
      });

      it('returns false for non-empty directory', async () => {
        const dirPath = path.join(tmpDir, 'notempty');
        await fs.mkdir(dirPath, { recursive: true });
        await fs.writeFile(path.join(dirPath, 'file.txt'), 'data', 'utf-8');
        expect(await isDirEmpty(dirPath)).toBe(false);
      });

      it('returns true for non-existent directory', async () => {
        expect(await isDirEmpty(path.join(tmpDir, 'nope'))).toBe(true);
      });

      it('returns false when the path is not a directory', async () => {
        // readdir on a file throws ENOTDIR (a non-ENOENT error); isDirEmpty
        // must report false so callers never treat an unreadable path as empty.
        const filePath = path.join(tmpDir, 'a-file.txt');
        await fs.writeFile(filePath, 'data', 'utf-8');
        expect(await isDirEmpty(filePath)).toBe(false);
      });
    });
  });

  describe('removeZCWSkillsForPlatform', () => {
    const claudePlatform: Platform = PLATFORMS.find((p) => p.id === 'claude')!;

    it('removes installed ZCW skills', async () => {
      await copyZCWSkillsForPlatform(tmpDir, claudePlatform, true, 'skills', 'project');

      const skillsDir = path.join(tmpDir, '.claude', 'skills');
      const entriesBefore = await fs.readdir(skillsDir);
      const zcwEntries = entriesBefore.filter((e) => e.startsWith('zcw'));
      expect(zcwEntries.length).toBeGreaterThan(0);

      const result = await removeZCWSkillsForPlatform(tmpDir, claudePlatform, 'project');
      expect(result.removed).toBeGreaterThan(0);

      for (const entry of zcwEntries) {
        expect(await fileExists(path.join(skillsDir, entry))).toBe(false);
      }
    });

    it('handles already-removed skills gracefully', async () => {
      const result = await removeZCWSkillsForPlatform(tmpDir, claudePlatform, 'project');
      expect(result.removed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('removes OpenCode commands', async () => {
      const opencodePlatform: Platform = PLATFORMS.find((p) => p.id === 'opencode')!;

      await copyZCWSkillsForPlatform(tmpDir, opencodePlatform, true, 'skills', 'project');

      const commandsDir = path.join(tmpDir, '.opencode', 'commands');
      expect(await fileExists(commandsDir)).toBe(true);

      const result = await removeZCWSkillsForPlatform(tmpDir, opencodePlatform, 'project');
      expect(result.removed).toBeGreaterThan(0);
    });

    it('removes only the managed Pi extension and preserves shared settings', async () => {
      const piPlatform: Platform = PLATFORMS.find((p) => p.id === 'pi')!;
      const extensionsDir = path.join(tmpDir, '.pi', 'extensions');
      const zcwExtension = path.join(extensionsDir, 'zcw-commands.ts');
      const unrelatedExtension = path.join(extensionsDir, 'custom.ts');
      const settingsPath = path.join(tmpDir, '.pi', 'settings.json');

      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify({ theme: 'dark' }), 'utf-8');
      await copyZCWSkillsForPlatform(tmpDir, piPlatform, true, 'skills', 'project');
      await fs.writeFile(unrelatedExtension, 'export default function custom() {}', 'utf-8');

      const result = await removeZCWSkillsForPlatform(tmpDir, piPlatform, 'project');
      const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));

      expect(result.removed).toBeGreaterThan(0);
      expect(await fileExists(zcwExtension)).toBe(false);
      expect(await fileExists(unrelatedExtension)).toBe(true);
      expect(settings).toEqual({ theme: 'dark', enableSkillCommands: true });
    });

    it('removes ZCW skills from the legacy global Pi directory', async () => {
      const piPlatform: Platform = PLATFORMS.find((p) => p.id === 'pi')!;
      const legacySkill = path.join(tmpDir, '.pi', 'skills', 'zcw', 'SKILL.md');

      await fs.mkdir(path.dirname(legacySkill), { recursive: true });
      await fs.writeFile(legacySkill, '# ZCW', 'utf-8');

      const result = await removeZCWSkillsForPlatform(tmpDir, piPlatform, 'global');

      expect(result.removed).toBe(1);
      expect(await fileExists(legacySkill)).toBe(false);
    });
  });

  describe('removeZCWRulesForPlatform', () => {
    it('removes rules for a platform that supports them', async () => {
      const claudePlatform: Platform = PLATFORMS.find((p) => p.id === 'claude')!;

      await copyZCWRulesForPlatform(tmpDir, claudePlatform, true, 'project');

      const rulePath = path.join(tmpDir, '.claude', 'rules', 'zcw-phase-guard.md');
      expect(await fileExists(rulePath)).toBe(true);

      const result = await removeZCWRulesForPlatform(tmpDir, claudePlatform, 'project');
      expect(result.removed).toBeGreaterThan(0);
      expect(await fileExists(rulePath)).toBe(false);
    });

    it('removes Cursor MDC format rules', async () => {
      const cursorPlatform: Platform = PLATFORMS.find((p) => p.id === 'cursor')!;

      await copyZCWRulesForPlatform(tmpDir, cursorPlatform, true, 'project');

      const rulePath = path.join(tmpDir, '.cursor', 'rules', 'zcw-phase-guard.mdc');
      expect(await fileExists(rulePath)).toBe(true);

      const result = await removeZCWRulesForPlatform(tmpDir, cursorPlatform, 'project');
      expect(result.removed).toBeGreaterThan(0);
      expect(await fileExists(rulePath)).toBe(false);
    });

    it('removes GitHub Copilot instructions format', async () => {
      const copilotPlatform: Platform = PLATFORMS.find((p) => p.id === 'github-copilot')!;

      await copyZCWRulesForPlatform(tmpDir, copilotPlatform, true, 'project');

      const rulePath = path.join(
        tmpDir,
        '.github',
        'instructions',
        'zcw-phase-guard.instructions.md',
      );
      expect(await fileExists(rulePath)).toBe(true);

      const result = await removeZCWRulesForPlatform(tmpDir, copilotPlatform, 'project');
      expect(result.removed).toBeGreaterThan(0);
      expect(await fileExists(rulePath)).toBe(false);
    });

    it('skips platforms without rules support', async () => {
      const geminiPlatform: Platform = PLATFORMS.find((p) => p.id === 'gemini')!;
      const result = await removeZCWRulesForPlatform(tmpDir, geminiPlatform, 'project');
      expect(result.removed).toBe(0);
    });
  });

  describe('removeZCWHooksForPlatform', () => {
    it('removes Claude Code hooks while preserving non-ZCW hooks', async () => {
      const claudePlatform: Platform = PLATFORMS.find((p) => p.id === 'claude')!;

      const settingsDir = path.join(tmpDir, '.claude');
      await fs.mkdir(settingsDir, { recursive: true });
      const settingsPath = path.join(settingsDir, 'settings.local.json');
      const settings = {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [
                {
                  type: 'command',
                  command: 'bash .claude/skills/zcw/scripts/zcw-hook-guard.sh',
                },
                { type: 'command', command: 'bash my-custom-hook.sh' },
              ],
            },
          ],
        },
      };
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      await installZCWHooksForPlatform(tmpDir, claudePlatform, 'project');

      const result = await removeZCWHooksForPlatform(tmpDir, claudePlatform, 'project');
      expect(result.removed).toBeGreaterThan(0);

      const updatedContent = await fs.readFile(settingsPath, 'utf-8');
      const updated = JSON.parse(updatedContent);
      expect(updated.hooks.PreToolUse).toBeDefined();
      expect(updated.hooks.PreToolUse.length).toBeGreaterThan(0);

      const allCommands = updated.hooks.PreToolUse.flatMap((g: Record<string, unknown>) =>
        (g.hooks as Array<Record<string, unknown>>).map((h: Record<string, unknown>) => h.command),
      );
      expect(allCommands).toContain('bash my-custom-hook.sh');
      expect(allCommands.some((c: string) => c.includes('zcw-hook-guard'))).toBe(false);
    });

    it('removes Copilot hook file', async () => {
      const copilotPlatform: Platform = PLATFORMS.find((p) => p.id === 'github-copilot')!;

      const hooksDir = path.join(tmpDir, '.github', 'hooks');
      await fs.mkdir(hooksDir, { recursive: true });
      const hookFilePath = path.join(hooksDir, 'zcw-guard.json');
      await fs.writeFile(hookFilePath, JSON.stringify({ version: 1 }), 'utf-8');

      expect(await fileExists(hookFilePath)).toBe(true);

      const result = await removeZCWHooksForPlatform(tmpDir, copilotPlatform, 'project');
      expect(result.removed).toBe(1);
      expect(await fileExists(hookFilePath)).toBe(false);
    });

    it('removes Kiro hook files', async () => {
      const kiroPlatform: Platform = PLATFORMS.find((p) => p.id === 'kiro')!;

      const hooksDir = path.join(tmpDir, '.kiro', 'hooks');
      await fs.mkdir(hooksDir, { recursive: true });
      const hookFilePath = path.join(hooksDir, 'zcw-hook-guard.kiro.hook');
      await fs.writeFile(hookFilePath, JSON.stringify({ enabled: true }), 'utf-8');

      expect(await fileExists(hookFilePath)).toBe(true);

      const result = await removeZCWHooksForPlatform(tmpDir, kiroPlatform, 'project');
      expect(result.removed).toBe(1);
      expect(await fileExists(hookFilePath)).toBe(false);
    });

    it('skips platforms without hooks support', async () => {
      const cursorPlatform: Platform = PLATFORMS.find((p) => p.id === 'cursor')!;
      const result = await removeZCWHooksForPlatform(tmpDir, cursorPlatform, 'project');
      expect(result.removed).toBe(0);
    });

    it('cleans up empty hooks section after removal', async () => {
      const claudePlatform: Platform = PLATFORMS.find((p) => p.id === 'claude')!;
      const settingsDir = path.join(tmpDir, '.claude');
      await fs.mkdir(settingsDir, { recursive: true });
      const settingsPath = path.join(settingsDir, 'settings.local.json');

      const settings = {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [
                {
                  type: 'command',
                  command: 'bash .claude/skills/zcw/scripts/zcw-hook-guard.sh',
                },
              ],
            },
          ],
        },
      };
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const result = await removeZCWHooksForPlatform(tmpDir, claudePlatform, 'project');
      expect(result.removed).toBe(1);

      const updatedContent = await fs.readFile(settingsPath, 'utf-8');
      const updated = JSON.parse(updatedContent);
      expect(updated.hooks).toBeUndefined();
    });
  });

  describe('removeWorkingDirs', () => {
    it('removes .zcw directory', async () => {
      const zcwDir = path.join(tmpDir, '.zcw');
      await fs.mkdir(zcwDir, { recursive: true });
      await fs.writeFile(path.join(zcwDir, 'config.yaml'), 'test: true', 'utf-8');

      const result = await removeWorkingDirs(tmpDir);
      expect(result.removed).toBeGreaterThan(0);
      expect(await fileExists(zcwDir)).toBe(false);
    });

    it('removes empty docs/superpowers directories', async () => {
      const specsDir = path.join(tmpDir, 'docs', 'superpowers', 'specs');
      const plansDir = path.join(tmpDir, 'docs', 'superpowers', 'plans');
      await fs.mkdir(specsDir, { recursive: true });
      await fs.mkdir(plansDir, { recursive: true });

      await removeWorkingDirs(tmpDir);

      expect(await fileExists(path.join(tmpDir, 'docs'))).toBe(false);
    });

    it('preserves non-empty docs directories', async () => {
      const specsDir = path.join(tmpDir, 'docs', 'superpowers', 'specs');
      await fs.mkdir(specsDir, { recursive: true });
      await fs.writeFile(path.join(specsDir, 'important.md'), 'keep me', 'utf-8');

      await removeWorkingDirs(tmpDir);

      expect(await fileExists(path.join(tmpDir, 'docs'))).toBe(true);
      expect(await fileExists(path.join(specsDir, 'important.md'))).toBe(true);
    });
  });

  describe('full uninstall cycle', () => {
    it('installs and then completely removes ZCW for Claude Code', async () => {
      const claudePlatform: Platform = PLATFORMS.find((p) => p.id === 'claude')!;

      // Install everything
      await copyZCWSkillsForPlatform(tmpDir, claudePlatform, true, 'skills', 'project');
      await copyZCWRulesForPlatform(tmpDir, claudePlatform, true, 'project');
      await installZCWHooksForPlatform(tmpDir, claudePlatform, 'project');

      // Verify installation
      const skillsDir = path.join(tmpDir, '.claude', 'skills');
      const skillEntries = (await fs.readdir(skillsDir)).filter((e) => e.startsWith('zcw'));
      expect(skillEntries.length).toBeGreaterThan(0);

      const rulePath = path.join(tmpDir, '.claude', 'rules', 'zcw-phase-guard.md');
      expect(await fileExists(rulePath)).toBe(true);

      // Uninstall everything
      const skillsResult = await removeZCWSkillsForPlatform(tmpDir, claudePlatform, 'project');
      expect(skillsResult.removed).toBeGreaterThan(0);

      const rulesResult = await removeZCWRulesForPlatform(tmpDir, claudePlatform, 'project');
      expect(rulesResult.removed).toBeGreaterThan(0);

      const hooksResult = await removeZCWHooksForPlatform(tmpDir, claudePlatform, 'project');
      expect(hooksResult.removed).toBeGreaterThan(0);

      // Verify complete removal
      for (const entry of skillEntries) {
        expect(await fileExists(path.join(skillsDir, entry))).toBe(false);
      }
      expect(await fileExists(rulePath)).toBe(false);
    });
  });
});

// --- uninstallCommand interactive selection tests ---

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn().mockResolvedValue(true),
  checkbox: vi.fn().mockResolvedValue([]),
}));

import { select, checkbox } from '@inquirer/prompts';
import { uninstallCommand } from '../../src/commands/uninstall.js';

const mockedSelect = vi.mocked(select);
const mockedCheckbox = vi.mocked(checkbox);

describe('uninstallCommand interactive selection', () => {
  let tmpDir: string;

  beforeEach(async () => {
    mockedSelect.mockReset();
    mockedCheckbox.mockReset();
    mockedSelect.mockResolvedValue(true as never);
    tmpDir = path.join(
      os.tmpdir(),
      `zcw-uninstall-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('auto-selects single target and uninstalls on confirmation', async () => {
    const claudePlatform = PLATFORMS.find((p) => p.id === 'claude')!;
    await copyZCWSkillsForPlatform(tmpDir, claudePlatform, true, 'skills', 'project');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await uninstallCommand(tmpDir, { force: false });
    } finally {
      log.mockRestore();
    }

    expect(mockedSelect).toHaveBeenCalled();
    expect(mockedCheckbox).not.toHaveBeenCalled();

    const skillsDir = path.join(tmpDir, '.claude', 'skills');
    const entries = (await fs.readdir(skillsDir)).filter((e) => e.startsWith('zcw'));
    expect(entries.length).toBe(0);
  });

  it('cancels when single target user declines', async () => {
    const claudePlatform = PLATFORMS.find((p) => p.id === 'claude')!;
    await copyZCWSkillsForPlatform(tmpDir, claudePlatform, true, 'skills', 'project');

    mockedSelect.mockResolvedValue(false as never);

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await uninstallCommand(tmpDir, { force: false });
    } finally {
      log.mockRestore();
    }

    const skillsDir = path.join(tmpDir, '.claude', 'skills');
    const entries = (await fs.readdir(skillsDir)).filter((e) => e.startsWith('zcw'));
    expect(entries.length).toBeGreaterThan(0);
  });

  it('shows checkbox when multiple targets detected', async () => {
    const claudePlatform = PLATFORMS.find((p) => p.id === 'claude')!;
    await copyZCWSkillsForPlatform(tmpDir, claudePlatform, true, 'skills', 'project');
    // Create a second platform (codex) fixture
    const codexDir = path.join(tmpDir, '.codex', 'skills', 'zcw');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(path.join(codexDir, 'SKILL.md'), '# ZCW', 'utf-8');

    mockedCheckbox.mockResolvedValue(['claude:project'] as never);

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await uninstallCommand(tmpDir, { force: false });
    } finally {
      log.mockRestore();
    }

    expect(mockedCheckbox).toHaveBeenCalled();
    expect(mockedSelect).not.toHaveBeenCalled();

    // Claude should be uninstalled
    const claudeSkillsDir = path.join(tmpDir, '.claude', 'skills');
    const claudeEntries = (await fs.readdir(claudeSkillsDir)).filter((e) => e.startsWith('zcw'));
    expect(claudeEntries.length).toBe(0);

    // Codex should remain
    expect(await fileExists(path.join(codexDir, 'SKILL.md'))).toBe(true);
  });

  it('skips prompt with --force and uninstalls all', async () => {
    const claudePlatform = PLATFORMS.find((p) => p.id === 'claude')!;
    await copyZCWSkillsForPlatform(tmpDir, claudePlatform, true, 'skills', 'project');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await uninstallCommand(tmpDir, { force: true });
    } finally {
      log.mockRestore();
    }

    expect(mockedSelect).not.toHaveBeenCalled();
    expect(mockedCheckbox).not.toHaveBeenCalled();

    const skillsDir = path.join(tmpDir, '.claude', 'skills');
    const entries = (await fs.readdir(skillsDir)).filter((e) => e.startsWith('zcw'));
    expect(entries.length).toBe(0);
  });

  it('skips prompt with --json and uninstalls all', async () => {
    const claudePlatform = PLATFORMS.find((p) => p.id === 'claude')!;
    await copyZCWSkillsForPlatform(tmpDir, claudePlatform, true, 'skills', 'project');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let jsonOutput;
    try {
      await uninstallCommand(tmpDir, { json: true });
      jsonOutput = log.mock.calls.map((c) => c.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    expect(mockedSelect).not.toHaveBeenCalled();
    expect(mockedCheckbox).not.toHaveBeenCalled();

    const result = JSON.parse(jsonOutput);
    expect(result.summary.targetsProcessed).toBeGreaterThan(0);
  });

  it('prints message when no targets found', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let output;
    try {
      await uninstallCommand(tmpDir);
      output = log.mock.calls.map((c) => c.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    expect(output).toContain('No ZCW installations found');
    expect(mockedSelect).not.toHaveBeenCalled();
  });
});
