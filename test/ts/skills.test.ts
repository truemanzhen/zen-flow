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

    it('copies to Chinese skills directory when language is zh', async () => {
      const result = await copyZCWSkillsForPlatform(tmpDir, mockPlatform, false, 'skills-zh');
      expect(result.copied).toBeGreaterThan(0);

      const manifest = await readManifest();
      for (const skillRelPath of manifest.skills) {
        const copiedPath = path.join(tmpDir, '.claude', 'skills', skillRelPath);
        expect(await fileExists(copiedPath), `zh install should include ${skillRelPath}`).toBe(
          true,
        );
      }
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

    it('creates OpenCode slash commands from the selected language skill content', async () => {
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
      expect(command).toContain('# ZCW 阶段 1：开启（Open）');
      expect(command).toContain('## 步骤');
      expect(command).not.toContain('# ZCW Phase 1: Open');
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

  describe('Chinese Zen Flow workflow safeguards', () => {
    it('requires Spec Kit instructions for each standard open artifact', async () => {
      const zhOpen = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw-open', 'SKILL.md'),
        'utf-8',
      );

      expect(zhOpen).toContain('speckit instructions proposal --change "<name>" --json');
      expect(zhOpen).toContain('speckit instructions design --change "<name>" --json');
      expect(zhOpen).toContain('speckit instructions tasks --change "<name>" --json');
      for (const field of [
        '`context`',
        '`rules`',
        '`template`',
        '`instruction`',
        '`resolvedOutputPath`',
        '`dependencies`',
      ]) {
        expect(zhOpen).toContain(field);
      }
      expect(zhOpen).toContain('不得复制到 artifact 内容中');
      expect(zhOpen).toContain('每创建一个 artifact 后');
      expect(zhOpen).toContain('speckit status --change "<name>" --json');
      expect(zhOpen).toContain('必须立即停止 artifact 创建');
      expect(zhOpen).toContain('不得回退为硬编码文档结构');
    });

    it('requires Spec Kit instructions for each standard open artifact (English)', async () => {
      const enOpen = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw-open', 'SKILL.md'),
        'utf-8',
      );

      expect(enOpen).toContain('speckit instructions proposal --change "<name>" --json');
      expect(enOpen).toContain('speckit instructions design --change "<name>" --json');
      expect(enOpen).toContain('speckit instructions tasks --change "<name>" --json');
      for (const field of [
        '`context`',
        '`rules`',
        '`template`',
        '`instruction`',
        '`resolvedOutputPath`',
        '`dependencies`',
      ]) {
        expect(enOpen).toContain(field);
      }
      expect(enOpen).toContain('must not copy them into the artifact content');
      expect(enOpen).toContain('After creating each artifact');
      expect(enOpen).toContain('speckit status --change "<name>" --json');
      expect(enOpen).toContain('must immediately stop artifact creation');
      expect(enOpen).toContain('Must not fall back to hard-coded artifact prose');
    });

    it('requires explicit user confirmation at full-workflow decision points', async () => {
      const zhZCW = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw', 'SKILL.md'),
        'utf-8',
      );
      const zhOpen = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw-open', 'SKILL.md'),
        'utf-8',
      );
      const zhDesign = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw-design', 'SKILL.md'),
        'utf-8',
      );
      const zhBuild = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw-build', 'SKILL.md'),
        'utf-8',
      );
      const zhVerify = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw-verify', 'SKILL.md'),
        'utf-8',
      );
      const zhArchive = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw-archive', 'SKILL.md'),
        'utf-8',
      );
      const zhHotfix = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw-hotfix', 'SKILL.md'),
        'utf-8',
      );
      const zhTweak = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw-tweak', 'SKILL.md'),
        'utf-8',
      );
      const zhZCWRule = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'rules', 'zcw-phase-guard.md'),
        'utf-8',
      );
      const zhDecisionPoint = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw', 'reference', 'decision-point.md'),
        'utf-8',
      );
      const zhDebugGate = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw', 'reference', 'debug-gate.md'),
        'utf-8',
      );

      expect(zhZCW).toContain('决策点是阻塞点');
      expect(zhZCW).toContain('`zcw/reference/decision-point.md`');
      expect(zhDecisionPoint).toContain(
        '若当前平台没有结构化提问工具，则必须在对话中提出明确选项并停止流程',
      );
      expect(zhDecisionPoint).toContain('不得用推荐规则、默认值、历史偏好');
      expect(zhOpen).toContain('### 1b. 需求澄清完成确认（阻塞点）');
      expect(zhOpen).toContain(
        '不得在用户确认需求澄清完成前创建 spec.md、plan.md 或 tasks.md',
      );
      expect(zhOpen).toContain('`zcw/reference/decision-point.md`');
      expect(zhOpen).toContain(
        '完整 `/zcw` 流程默认不得使用 Skill 工具加载 `speckit-propose` 技能',
      );
      expect(zhOpen).toContain(
        '技能加载后，按其指引创建 change 骨架，但当 Step 1b 的已确认澄清摘要已存在于对话上下文时',
      );
      expect(zhOpen).not.toContain('Spec Kit artifact 指令');
      expect(zhOpen).not.toContain('fast-forward');
      expect(zhOpen).toContain(
        '澄清摘要必须包含：目标、非目标、范围边界、关键未知项、验收场景草案',
      );
      expect(zhDesign).toContain(
        '**立即执行：** 使用 Skill 工具加载 Superpowers `brainstorming` 技能。禁止跳过此步骤。',
      );
      expect(zhDesign).toContain('技能加载后，按其指引使用以下上下文');
      expect(zhDesign).not.toContain('ARGUMENTS 包含');
      expect(zhDesign).toContain(
        '必须按 `zcw/reference/decision-point.md` 的协议暂停并等待用户明确确认设计方案',
      );
      expect(zhDesign).toContain(
        '不得用“跳过重复上下文探索”削弱 Superpowers `brainstorming` 的澄清流程',
      );
      expect(zhDesign).not.toContain('跳过重复上下文探索，直接进入设计提问');
      expect(zhBuild).toContain('不得根据推荐规则自行选择 `branch` 或 `worktree`');
      expect(zhBuild).toContain('不得根据推荐规则自行选择执行方式');
      expect(zhBuild).toContain('`zcw/reference/decision-point.md`');
      expect(zhVerify).toContain(
        '验证不通过时**必须按 `zcw/reference/decision-point.md` 的协议暂停并等待用户决定修复或接受偏差',
      );
      expect(zhVerify).toContain(
        '必须按 `zcw/reference/decision-point.md` 的协议暂停并等待用户选择分支处理方式',
      );
      expect(zhVerify).toContain(
        '只有在用户完成选择且对应操作完成后，才允许写入 `branch_status: handled`',
      );
      expect(zhArchive).toContain('### 1. 归档前最终确认（阻塞点）');
      expect(zhArchive).toContain(
        '不得在用户确认前运行 `"$ZCW_BASH" "$ZCW_ARCHIVE" "<change-name>"`',
      );
      expect(zhArchive).toContain('`zcw/reference/decision-point.md`');
      expect(zhArchive).toContain('「确认归档」');
      expect(zhArchive).toContain('「需要调整或重新验证」');
      expect(zhArchive).toContain('「暂不归档」');
      expect(zhArchive).toContain(
        '`"$ZCW_BASH" "$ZCW_STATE" transition <change-name> archive-reopen`',
      );
      expect(zhVerify).toContain('不得因为验证已通过就自动归档');
      expect(zhHotfix).toContain(
        '满足升级条件时**必须按 `zcw/reference/decision-point.md` 的协议暂停并等待用户明确确认**升级为完整 `/zcw` 流程',
      );
      expect(zhHotfix).toContain('不得直接进入 `/zcw-design`');
      expect(zhTweak).toContain(
        '满足升级条件时**必须按 `zcw/reference/decision-point.md` 的协议暂停并等待用户明确确认**升级为完整 `/zcw` 流程',
      );
      expect(zhTweak).toContain('不得直接进入 `/zcw-design`');
      expect(zhZCW).toContain('`verify_result: fail` → 进入验证失败决策阻塞点');
      expect(zhZCW).not.toContain(
        '`verify_result: fail` → `"$ZCW_BASH" "$ZCW_STATE" transition <name> verify-fail` 后 `/zcw-build`',
      );
      expect(zhHotfix).toContain('按升级条件阻塞确认处理');
      expect(zhHotfix).not.toContain('停止 hotfix，升级为 `/zcw`');
      expect(zhTweak).toContain('按升级条件阻塞确认处理');

      // HIGH: hotfix/tweak IMPORTANT blocks must acknowledge verify decision points
      expect(zhHotfix).toContain('验证阶段（zcw-verify）的验证失败决策和分支处理决策');
      expect(zhTweak).toContain('验证阶段（zcw-verify）的验证失败决策和分支处理决策');
      expect(zhHotfix).toContain('归档前最终确认');
      expect(zhTweak).toContain('归档前最终确认');

      // MEDIUM: zcw-design brainstorming does not write Design Doc before confirmation
      expect(zhDesign).toContain('brainstorming 阶段不写入 Design Doc 文件');
      expect(zhDesign).toContain('增量更新 `brainstorm-summary.md`');
      expect(zhDesign).toContain('### 1e. 主动式上下文压缩');

      // MEDIUM: zcw-verify Spec drift requires user choice
      expect(zhVerify).toContain(
        '必须使用当前平台可用的用户输入/确认机制以单选题形式暂停并等待用户选择处理方式',
      );

      // MEDIUM: zcw/SKILL.md build phase resume recognizes plan-ready pause before build decisions
      expect(zhZCW).toContain('先检查 `build_pause`、`plan`、`build_mode` 和 `isolation`');
      expect(zhZCW).toContain('`build_pause: plan-ready` 且 plan 文件存在');
      expect(zhZCW).toContain('`build_pause` 不是执行方式，不得写入 `build_mode`');
      expect(zhZCW).toContain(
        '若 `build_pause: plan-ready` 但 `isolation` 和 `build_mode` 已经设置，则视为 stale pause',
      );
      expect(zhBuild).toContain('提供 plan-ready 暂停点');
      expect(zhBuild).toContain('不得自动继续，也不得把暂停写入 `build_mode`');
      expect(zhBuild).toContain('`build_mode` 为 `executing-plans`');
      expect(zhBuild).toContain('review_mode');
      expect(zhBuild).toContain('| `off` | 不自动派发代码审查 |');
      expect(zhBuild).toContain('| `standard` | 只在任务完成后运行一次最终轻量代码审查');
      expect(zhBuild).toContain(
        '| `thorough` | 按批次或风险边界运行合并审查，最后再运行一次完整审查 |',
      );
      expect(zhBuild).toContain('build → verify');
      expect(zhBuild).toContain(
        'CRITICAL review 发现（安全漏洞、数据丢失风险、构建/测试失败）必须先修复',
      );

      // MEDIUM: zcw-verify Step 1b treats CRITICAL/IMPORTANT as blocking
      expect(zhVerify).toContain('CRITICAL 或 IMPORTANT 失败项必须修复');
      expect(zhVerify).toContain('不允许跳过修复直接全部接受');
      expect(zhVerify).toContain('当 `review_mode: standard` 或 `thorough` 时');
      expect(zhVerify).toContain('当 `review_mode: off` 时跳过自动代码审查');
      expect(zhVerify).toContain('只检查正确性、安全、边界条件');
      expect(zhVerify).toContain('无 CRITICAL 或 IMPORTANT 问题');
      expect(zhVerify).toContain('不影响正确性、安全、边界条件的 code pattern consistency 建议');
      expect(zhVerify).toContain('不执行 spec 覆盖率、Design Doc 一致性或漂移检查');
      expect(zhHotfix).toContain('默认 `review_mode: off`');

      // MEDIUM: hotfix IMPORTANT covers >3-tasks zcw-build decision points
      expect(zhHotfix).toContain('任务超过 3 个转入 `/zcw-build` 时的工作区隔离和执行方式选择');

      // LOW: zcw-build "中" level requires user confirmation before brainstorming
      expect(zhBuild).toContain(
        '使用当前平台可用的用户输入/确认机制暂停并等待用户确认后**，必须使用 Skill 工具加载 Superpowers `brainstorming`',
      );

      // LOW: zcw-build 50% threshold is a hard decision point
      expect(zhBuild).toContain(
        '必须按 `zcw/reference/decision-point.md` 的协议暂停并等待用户决定是否拆分为新 change',
      );

      // LOW: zcw-verify Step 2b disambiguates plan.md vs Design Doc
      expect(zhVerify).toContain('实现符合 `specs/<name>/plan.md` 高层设计决策');
      expect(zhTweak).not.toContain('停止 tweak，升级为完整 `/zcw`');

      // CRITICAL: build scope split must not bypass ZCW state initialization
      expect(zhBuild).toContain('通过 `/zcw-open` 创建独立 change');
      expect(zhBuild).not.toContain('`/opsx:new` 创建独立 change');

      // CRITICAL: open phase PRD split must happen before Spec Kit artifacts are created
      expect(zhOpen).toContain('### 1a. PRD 拆分预检（阻塞点）');
      expect(zhOpen).toContain('创建多个 Spec Kit changes');
      expect(zhOpen).toContain('保持为一个 change');
      expect(zhOpen).toContain('调整拆分方案后继续');
      expect(zhOpen).toContain('每个被接受的拆分项都必须通过 `/zcw-open` 创建独立 change');
      expect(zhOpen).not.toContain('每个被接受的拆分项都必须通过 `/opsx:new` 创建独立 change');
      expect(zhOpen).toContain('已确认拆分项');
      expect(zhOpen).toContain('跳过 PRD 拆分预检');
      expect(zhOpen).toContain(
        '批量拆分模式下，单个拆分项完成 open 阶段后不得自动流转到 `/zcw-design`',
      );
      expect(zhOpen).toContain('拆分完毕后必须暂停询问用户开始哪一个 change');
      expect(zhOpen).toContain('恢复时先检查已创建的 active changes');

      // IMPORTANT: main entry and build subskill agree scope expansion is blocking
      expect(zhZCW).toContain('build 阶段范围扩张需重新设计或拆分新 change');
      expect(zhZCW).toContain('archive 阶段执行归档脚本前的最终确认');
      expect(zhZCW).toContain('open 阶段大型 PRD 需确认拆分为多个 change');

      // IMPORTANT: accepted Spec drift edits must not loop back through dirty-worktree handling
      expect(zhVerify).toContain('选项 A 属于 verify 阶段允许产物');

      // Dependency triggers must be explicit skill invocations, not ambiguous prose.
      expect(zhBuild).toContain('必须使用 Skill 工具加载 Superpowers `using-git-worktrees`');
      expect(zhBuild).not.toContain('或使用原生 `EnterWorktree` 工具');
      expect(zhBuild).toContain('必须使用 Skill 工具加载 Superpowers `brainstorming`');
      expect(zhZCW).toContain(
        '若 `build_mode: subagent-driven-development`，不得在主窗口直接执行任务',
      );
      expect(zhBuild).toContain('主会话只负责协调，禁止直接编写实现代码');
      expect(zhBuild).toContain('如果当前平台没有真实后台 agent 调度能力');
      expect(zhBuild).toContain(
        '先确认当前平台存在可调用的真实后台 subagent / Task / multi-agent 调度能力',
      );
      expect(zhBuild).toContain(
        '`"$ZCW_BASH" "$ZCW_STATE" set <name> subagent_dispatch confirmed`',
      );
      expect(zhBuild).toContain(
        '用户选择改用主窗口执行后，必须先运行 `"$ZCW_BASH" "$ZCW_STATE" set <name> build_mode executing-plans`',
      );
      expect(zhBuild).not.toContain('使用 Skill 工具加载对应技能');
      expect(zhBuild).toContain('tdd_mode');
      expect(zhBuild).toContain('`"$ZCW_BASH" "$ZCW_STATE" set <name> tdd_mode <tdd|direct>`');
      expect(zhBuild).toContain('若 `tdd_mode: tdd`');
      expect(zhBuild).toContain(
        'TDD 约束和证据门槛已在 `zcw/reference/subagent-dispatch.md` 中定义',
      );
      expect(zhZCW).toContain('`tdd_mode`');
      expect(zhZCW).toContain('full workflow 离开 build 阶段前 `tdd_mode` 必须已选择');
      expect(zhHotfix).toContain('立即使用 Skill 工具加载 `zcw-design` skill');
      expect(zhTweak).toContain('立即使用 Skill 工具加载 `zcw-design` skill');
      expect(zhVerify).toContain(
        '用户选择 B 后，运行 `"$ZCW_BASH" "$ZCW_STATE" transition <change-name> verify-fail`，然后调用 `/zcw-build`',
      );

      // CRITICAL: implementation-time crashes must enter systematic debugging and keep tests in the current change.
      expect(zhBuild).toContain('必须使用 Skill 工具加载 Superpowers `systematic-debugging` 技能');
      expect(zhBuild).toContain('`zcw/reference/debug-gate.md`');
      expect(zhBuild).toContain(
        '运行程序、测试、构建或手动验证时出现崩溃、异常行为、测试失败或构建失败',
      );
      expect(zhHotfix).toContain('必须使用 Skill 工具加载 Superpowers `systematic-debugging` 技能');
      expect(zhHotfix).toContain('`zcw/reference/debug-gate.md`');
      expect(zhTweak).toContain('`zcw/reference/debug-gate.md`');
      expect(zhDebugGate).toContain('先补充能复现该崩溃/异常的最小失败测试');
      expect(zhDebugGate).toContain(
        '不得通过另起一个“写测试用例”的 change 来替代当前 change 的验证闭环',
      );

      // CRITICAL: user-confirmation gates must not hardcode a platform-specific tool name.
      expect(
        [zhZCW, zhDesign, zhBuild, zhVerify, zhArchive, zhHotfix, zhTweak].join('\n'),
      ).not.toContain('AskUserQuestion');
      expect(zhZCW).toContain('`auto_transition`');
      expect(zhZCW).toContain('不影响 phase 推进');
      expect(zhZCWRule).toContain(
        'brainstorming in progress: incrementally update brainstorm-summary.md',
      );
      expect(zhZCWRule).toContain('active compaction gate');
      expect(zhZCWRule).toContain(
        '使用 Skill 工具重新加载 Superpowers `subagent-driven-development` 技能',
      );
      expect(zhZCWRule).toContain(
        '读取 `zcw/reference/subagent-dispatch.md` 获取 ZCW 专属扩展',
      );
      expect(zhZCWRule).toContain('禁止在主会话中直接执行 task');
      for (const [content] of [
        [zhOpen, '/zcw-design'],
        [zhDesign, '/zcw-build'],
        [zhBuild, '/zcw-verify'],
        [zhVerify, '/zcw-archive'],
      ] as const) {
        expect(content).toContain('自动衔接下一阶段');
        expect(content).toContain('"$ZCW_BASH" "$ZCW_STATE" next <change-name>');
        expect(content).toContain('`NEXT: auto`');
        expect(content).toContain('`NEXT: manual`');
        expect(content).toContain('按 `HINT`');
      }
      expect(zhHotfix).toContain('自动衔接下一阶段');
      expect(zhHotfix).toContain('"$ZCW_BASH" "$ZCW_STATE" next <name>');
      expect(zhHotfix).toContain('`NEXT: auto`');
      expect(zhHotfix).toContain(
        '`phase: build` 返回 `zcw-hotfix`，`verify` 返回 `zcw-verify`，`archive` 返回 `zcw-archive`',
      );
      expect(zhTweak).toContain('自动衔接下一阶段');
      expect(zhTweak).toContain('"$ZCW_BASH" "$ZCW_STATE" next <name>');
      expect(zhTweak).toContain('`NEXT: auto`');
      expect(zhTweak).toContain(
        '`phase: build` 返回 `zcw-tweak`，`verify` 返回 `zcw-verify`，`archive` 返回 `zcw-archive`',
      );
    });
  });

  describe('English Zen Flow workflow safeguards', () => {
    it('matches the Chinese workflow decision-point requirements', async () => {
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
        'must not choose the execution method or TDD mode based on recommendation rules',
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
      expect(enHotfix).toContain('6 quick checks, including lightweight code review');
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
        're-read `zcw/reference/subagent-dispatch.md` for ZCW-specific extensions',
      );
      expect(enZCWRule).toContain('Do not execute the pending task directly in the main window');
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

      const readSkills = async (languageDir: 'skills' | 'skills-zh') =>
        Object.fromEntries(
          await Promise.all(
            skillNames.map(async (skillName) => [
              skillName,
              await fs.readFile(
                path.resolve('assets', languageDir, skillName, 'SKILL.md'),
                'utf-8',
              ),
            ]),
          ),
        ) as Record<(typeof skillNames)[number], string>;

      const zhSkills = await readSkills('skills-zh');
      const enSkills = await readSkills('skills');

      expect(zhSkills.zcw).toContain('输出语言规则');
      expect(zhSkills.zcw).toContain('以触发本次工作流的用户请求语言作为默认输出语言');
      expect(zhSkills['zcw-open']).toContain(
        '传递给 Spec Kit 的所有提问和产物要求都必须包含输出语言约束',
      );
      expect(zhSkills['zcw-design']).toContain('Language: 使用触发本次工作流的用户请求语言输出');
      expect(zhSkills['zcw-build']).toContain(
        '计划文件和执行反馈必须使用触发本次工作流的用户请求语言',
      );
      expect(zhSkills['zcw-build']).toContain('ARGUMENTS 必须包含与 Step 1 相同的 Language 约束');
      expect(zhSkills['zcw-verify']).toContain(
        '验证报告和分支处理说明必须使用触发本次工作流的用户请求语言',
      );
      expect(zhSkills['zcw-archive']).toContain(
        '归档摘要和生命周期闭环说明必须使用触发本次工作流的用户请求语言',
      );
      expect(zhSkills['zcw-hotfix']).toContain(
        '精简版 Spec Kit 产物必须使用触发本次工作流的用户请求语言',
      );
      expect(zhSkills['zcw-tweak']).toContain(
        '精简版 Spec Kit 产物必须使用触发本次工作流的用户请求语言',
      );

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
    it('composes the Superpowers loop with the Chinese ZCW dispatch contract', async () => {
      const zhBuild = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw-build', 'SKILL.md'),
        'utf-8',
      );
      const zhDispatch = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw', 'reference', 'subagent-dispatch.md'),
        'utf-8',
      );
      const zhRecovery = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'zcw', 'reference', 'context-recovery.md'),
        'utf-8',
      );
      const zhGuard = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'rules', 'zcw-phase-guard.md'),
        'utf-8',
      );

      expect(zhBuild).toContain(
        '使用 Skill 工具加载 Superpowers `subagent-driven-development` 技能',
      );
      expect(zhBuild).toContain('读取 `zcw/reference/subagent-dispatch.md` 获取 ZCW 专属扩展');
      expect(zhBuild).not.toContain('#### Subagent 调度协议');
      expect(zhDispatch).toContain('发生冲突时，以本文档中更具体的 ZCW 约束为准');
      expect(zhDispatch).toContain('不得把多个 task 打包给同一个 agent');
      expect(zhDispatch).toContain('每个 task 派发一个全新的后台 implementer agent');
      expect(zhDispatch).toContain('修复 agent 和 final reviewer');
      expect(zhDispatch).toContain('Language: 使用触发本次工作流的用户请求语言输出');
      expect(zhDispatch).toContain('允许修改的文件范围');
      expect(zhDispatch).toContain('必须执行的测试命令');
      expect(zhDispatch).toContain('提交哈希');
      expect(zhDispatch).toContain('确认提交和文件在当前工作树可见');
      expect(zhDispatch).toContain('实现提交或差异以及 RED/GREEN 证据');
      expect(zhDispatch).toContain('implementer 不得勾选 plan 或 Spec Kit task');
      expect(zhDispatch).toContain('协调者唯一允许的文件修改');
      expect(zhDispatch).toContain('plan、Spec Kit task 和 subagent 进度检查点');
      expect(zhDispatch).toContain('specs/<name>/.zcw/subagent-progress.md');
      expect(zhDispatch).toContain('final-review | final-fix');
      expect(zhDispatch).toContain('当前审查-修复轮次');
      expect(zhDispatch).toContain('已通过的审查阶段');
      expect(zhDispatch).toContain('所有 task 已勾选且检查点处于 `final-review` 或 `final-fix`');
      expect(zhDispatch).toContain(
        '使用 Skill 工具加载 Superpowers `test-driven-development` 技能',
      );
      expect(zhDispatch).toContain(
        '当 `review_mode: standard` 时，每个 task 不自动派发 per-task reviewer',
      );
      expect(zhDispatch).toContain('当 `review_mode: thorough` 时，不执行每 task 双审查');
      expect(zhDispatch).toContain('当 `review_mode: off` 时');
      expect(zhDispatch).toContain(
        '"$ZCW_BASH" "$ZCW_STATE" task-checkoff "$PLAN_FILE" "$PLAN_TASK_TEXT"',
      );
      expect(zhDispatch).not.toContain('PLAN_MATCHES="$(grep -cF');
      expect(zhDispatch).toContain('RED 失败命令与失败摘要');
      expect(zhDispatch).toContain('GREEN 通过命令与通过摘要');
      expect(zhDispatch).not.toContain("grep -n '\\- \\[ \\]' speckit/changes/<name>/tasks.md");
      expect(zhDispatch).toContain('禁止总结、禁止询问用户是否继续、禁止在任务之间等待用户输入');
      expect(zhDispatch).toContain('存在无法从仓库、计划或既有上下文消除的真实歧义');
      expect(zhDispatch).toContain('平台没有真实后台 agent 调度能力');
      expect(zhDispatch).toContain('不得加载 `finishing-a-development-branch`');
      expect(zhDispatch).toContain('返回 `zcw-build` 继续执行退出条件、阶段守卫和后续阶段衔接');
      expect(zhRecovery).toContain('重新加载 Superpowers `subagent-driven-development` 技能');
      expect(zhRecovery).toContain('重新阅读 `zcw/reference/subagent-dispatch.md`');
      expect(zhRecovery).toContain('读取 `specs/<name>/.zcw/subagent-progress.md`');
      expect(zhGuard).toContain('重新加载 Superpowers `subagent-driven-development` 技能');
      expect(zhGuard).toContain('读取 `zcw/reference/subagent-dispatch.md` 获取 ZCW 专属扩展');
      expect(zhGuard).toContain('读取 `specs/<name>/.zcw/subagent-progress.md`');
    });

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
        path.resolve('assets', 'skills', 'zcw', 'rules', 'zcw-phase-guard.en.md'),
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
      const zhGuard = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'rules', 'zcw-phase-guard.md'),
        'utf-8',
      );
      const enGuard = await fs.readFile(
        path.resolve('assets', 'skills', 'zcw', 'rules', 'zcw-phase-guard.en.md'),
        'utf-8',
      );

      const zhSection = section(zhGuard, '## 阶段退出后自动过渡');
      expect(zhSection).toContain('zcw-state next <change-name>');
      expect(zhSection).toContain('NEXT: auto');
      expect(zhSection).toContain('NEXT: manual');
      expect(zhSection).toContain('NEXT: done');
      expect(zhSection).not.toContain('必须调用下一阶段的 skill');
      expect(zhSection).not.toContain('open → `zcw-design`');

      const enSection = section(enGuard, '## Automatic Transition After Phase Exit');
      expect(enSection).toContain('zcw-state next <change-name>');
      expect(enSection).toContain('NEXT: auto');
      expect(enSection).toContain('NEXT: manual');
      expect(enSection).toContain('NEXT: done');
      expect(enSection).not.toContain("must invoke the next phase's skill");
      expect(enSection).not.toContain('open → `zcw-design`');
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

    it('keeps platform search roots out of English and Chinese skill prose', async () => {
      const manifest = await readManifest();
      const skillPaths = manifest.skills.filter(
        (skillPath) =>
          skillPath.endsWith('SKILL.md') &&
          (skillPath === 'zcw/SKILL.md' || skillPath.startsWith('zcw-')),
      );

      for (const languageDir of ['skills', 'skills-zh']) {
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

      for (const languageDir of ['skills', 'skills-zh']) {
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

      for (const languageDir of ['skills', 'skills-zh']) {
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

      for (const languageDir of ['skills', 'skills-zh']) {
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

      for (const languageDir of ['skills', 'skills-zh']) {
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
