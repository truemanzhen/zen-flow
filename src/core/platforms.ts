/**
 * Platform Definitions
 *
 * Supported AI coding platforms, mirroring Spec Kit integration IDs.
 * Reference: Spec Kit agent integration names
 */

import type { InstallScope } from './types.js';

export interface Platform {
  id: string;
  name: string;
  skillsDir: string;
  globalSkillsDir?: string;
  detectionPaths?: string[];
  specKitIntegrationId: string;
  /** Platform's rules/instructions subdirectory relative to rulesBaseDir (defaults to baseDir). Omit if unsupported. */
  rulesDir?: string;
  /** Override base directory for rules. When set, rules go to rulesBaseDir/rulesDir instead of skillsDir/rulesDir. Useful when rules live outside the skills config dir (e.g., Cline's .clinerules/ is at project root, not inside .cline/). */
  rulesBaseDir?: string;
  /** Rule file format: 'md' = plain markdown, 'mdc' = Cursor MDC with frontmatter, 'copilot' = GitHub Copilot instructions format. */
  rulesFormat?: 'md' | 'mdc' | 'copilot';
  /** Whether this platform supports PreToolUse hooks. */
  supportsHooks?: boolean;
  /** Hook configuration format. Determines how installZCWHooksForPlatform writes the hook config. */
  hookFormat?: 'claude-code' | 'gemini' | 'windsurf' | 'copilot' | 'qwen' | 'kiro' | 'qoder';
}

export function getPlatformSkillsDir(platform: Platform, scope: InstallScope): string {
  if (scope === 'global' && platform.globalSkillsDir) {
    return platform.globalSkillsDir;
  }
  return platform.skillsDir;
}

export function getPlatformSkillsDirs(platform: Platform, scope: InstallScope): string[] {
  return [getPlatformSkillsDir(platform, scope)];
}

export const PLATFORMS: Platform[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    skillsDir: '.claude',
    globalSkillsDir: '.claude',
    specKitIntegrationId: 'claude',
    rulesDir: 'rules',
    rulesFormat: 'md',
    supportsHooks: true,
    hookFormat: 'claude-code',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    skillsDir: '.cursor',
    globalSkillsDir: '.cursor',
    specKitIntegrationId: 'cursor',
    rulesDir: 'rules',
    rulesFormat: 'mdc',
  },
  {
    id: 'codex',
    name: 'Codex',
    skillsDir: '.codex',
    globalSkillsDir: '.codex',
    specKitIntegrationId: 'codex',
    rulesDir: 'rules',
    rulesFormat: 'md',
    supportsHooks: true,
    hookFormat: 'claude-code',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    skillsDir: '.opencode',
    globalSkillsDir: '.config/opencode',
    specKitIntegrationId: 'opencode',
    rulesDir: 'rules',
    rulesFormat: 'md',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    skillsDir: '.windsurf',
    globalSkillsDir: '.windsurf',
    specKitIntegrationId: 'windsurf',
    rulesDir: 'rules',
    rulesFormat: 'md',
    supportsHooks: true,
    hookFormat: 'windsurf',
  },
  {
    id: 'cline',
    name: 'Cline',
    skillsDir: '.cline',
    globalSkillsDir: '.cline',
    specKitIntegrationId: 'cline',
    // Cline rules go to .clinerules/ at project root, NOT inside .cline/
    rulesBaseDir: '',
    rulesDir: '.clinerules',
    rulesFormat: 'md',
  },
  {
    id: 'roocode',
    name: 'RooCode',
    skillsDir: '.roo',
    globalSkillsDir: '.roo',
    specKitIntegrationId: 'roocode',
    rulesDir: 'rules',
    rulesFormat: 'md',
  },
  {
    id: 'continue',
    name: 'Continue',
    skillsDir: '.continue',
    globalSkillsDir: '.continue',
    specKitIntegrationId: 'continue',
    rulesDir: 'rules',
    rulesFormat: 'md',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    skillsDir: '.github',
    globalSkillsDir: '.github',
    detectionPaths: [
      '.github/copilot-instructions.md',
      '.github/instructions',
      '.github/prompts',
      '.github/skills',
    ],
    specKitIntegrationId: 'github-copilot',
    // Copilot uses .github/instructions/*.instructions.md format
    rulesDir: 'instructions',
    rulesFormat: 'copilot',
    supportsHooks: true,
    hookFormat: 'copilot',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    skillsDir: '.gemini',
    globalSkillsDir: '.gemini',
    specKitIntegrationId: 'gemini',
    // Gemini uses GEMINI.md files, not a rules directory — no rulesDir
    supportsHooks: true,
    hookFormat: 'gemini',
  },
  {
    id: 'amazon-q',
    name: 'Amazon Q Developer',
    skillsDir: '.amazonq',
    globalSkillsDir: '.amazonq',
    specKitIntegrationId: 'amazon-q',
    rulesDir: 'rules',
    rulesFormat: 'md',
    supportsHooks: true,
    hookFormat: 'claude-code',
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    skillsDir: '.qwen',
    globalSkillsDir: '.qwen',
    specKitIntegrationId: 'qwen',
    rulesDir: 'rules',
    rulesFormat: 'md',
    supportsHooks: true,
    hookFormat: 'qwen',
  },
  {
    id: 'kilocode',
    name: 'Kilo Code',
    skillsDir: '.kilocode',
    globalSkillsDir: '.kilocode',
    specKitIntegrationId: 'kilocode',
    rulesDir: 'rules',
    rulesFormat: 'md',
  },
  {
    id: 'auggie',
    name: 'Auggie (Augment CLI)',
    skillsDir: '.augment',
    globalSkillsDir: '.augment',
    specKitIntegrationId: 'auggie',
    rulesDir: 'rules',
    rulesFormat: 'md',
  },
  {
    id: 'kiro',
    name: 'Kiro',
    skillsDir: '.kiro',
    globalSkillsDir: '.kiro',
    specKitIntegrationId: 'kiro',
    // Kiro uses .kiro/steering/ not .kiro/rules/
    rulesDir: 'steering',
    rulesFormat: 'md',
    supportsHooks: true,
    hookFormat: 'kiro',
  },
  {
    id: 'kimicode',
    name: 'Kimi Code',
    skillsDir: '.kimi-code',
    globalSkillsDir: '.kimi-code',
    specKitIntegrationId: 'kimi',
  },
  {
    id: 'lingma',
    name: 'Lingma',
    skillsDir: '.lingma',
    globalSkillsDir: '.lingma',
    specKitIntegrationId: 'lingma',
    rulesDir: 'rules',
    rulesFormat: 'md',
  },
  { id: 'junie', name: 'Junie', skillsDir: '.junie', specKitIntegrationId: 'junie' },
  {
    id: 'codebuddy',
    name: 'CodeBuddy Code',
    skillsDir: '.codebuddy',
    specKitIntegrationId: 'codebuddy',
  },
  { id: 'costrict', name: 'CoStrict', skillsDir: '.cospec', specKitIntegrationId: 'costrict' },
  { id: 'crush', name: 'Crush', skillsDir: '.crush', specKitIntegrationId: 'crush' },
  { id: 'factory', name: 'Factory Droid', skillsDir: '.factory', specKitIntegrationId: 'factory' },
  { id: 'iflow', name: 'iFlow', skillsDir: '.iflow', specKitIntegrationId: 'iflow' },
  {
    id: 'pi',
    name: 'Pi',
    skillsDir: '.pi',
    globalSkillsDir: '.pi/agent',
    specKitIntegrationId: 'pi',
  },
  {
    id: 'qoder',
    name: 'Qoder',
    skillsDir: '.qoder',
    globalSkillsDir: '.qoder',
    specKitIntegrationId: 'qoder',
    rulesDir: 'rules',
    rulesFormat: 'md',
    supportsHooks: true,
    hookFormat: 'qoder',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    skillsDir: '.agents',
    globalSkillsDir: '.gemini/antigravity',
    specKitIntegrationId: 'antigravity',
  },
  { id: 'bob', name: 'Bob Shell', skillsDir: '.bob', specKitIntegrationId: 'bob' },
  { id: 'forgecode', name: 'ForgeCode', skillsDir: '.forge', specKitIntegrationId: 'forgecode' },
  {
    id: 'trae',
    name: 'Trae',
    skillsDir: '.trae',
    globalSkillsDir: '.trae',
    specKitIntegrationId: 'trae',
    rulesDir: 'rules',
    rulesFormat: 'md',
  },
];
