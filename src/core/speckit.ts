import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PLATFORMS } from './platforms.js';
import { printCommandErrorDetails } from './command-error.js';

import type { InstallScope } from './types.js';

const VALID_TOOL_IDS = new Set(PLATFORMS.map((p) => p.specKitIntegrationId));
const ALL_SPECKIT_WORKFLOWS = [
  'constitution',
  'specify',
  'clarify',
  'plan',
  'tasks',
  'analyze',
  'checklist',
  'implement',
] as const;

function getNpmExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

function buildSpecKitInitInvocation(
  projectPath: string,
  toolIds: string[],
  scope: InstallScope,
  homeDir = os.homedir(),
): { command: string; args: string[] } {
  const targetPath = scope === 'global' ? homeDir : projectPath;
  const integration = toolIds[0] ?? 'codex';
  return { command: 'specify', args: ['init', targetPath, '--integration', integration] };
}

const ALL_WORKFLOWS_CONFIG =
  JSON.stringify(
    {
      featureFlags: {},
      profile: 'spec-kit',
      delivery: 'both',
      workflows: [...ALL_SPECKIT_WORKFLOWS],
    },
    null,
    2,
  ) + '\n';

function getSpecKitDefaultConfigDir(): string {
  const platform = os.platform();
  if (platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) {
      return path.join(appData, 'specify');
    }
    return path.join(os.homedir(), 'AppData', 'Roaming', 'specify');
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, 'specify');
  }
  return path.join(os.homedir(), '.config', 'specify');
}

function getSpecKitDefaultConfigPath(): string {
  return path.join(getSpecKitDefaultConfigDir(), 'config.json');
}

function createSpecKitAllWorkflowsEnv(): { env: NodeJS.ProcessEnv; configHome: string } {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'zcw-speckit-profile-'));
  try {
    const specKitConfigDir = path.join(configHome, 'specify');
    fs.mkdirSync(specKitConfigDir, { recursive: true });
    fs.writeFileSync(path.join(specKitConfigDir, 'config.json'), ALL_WORKFLOWS_CONFIG, 'utf-8');

    return {
      configHome,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: configHome,
      },
    };
  } catch (error) {
    fs.rmSync(configHome, { recursive: true, force: true });
    throw error;
  }
}

interface ConfigBackup {
  configPath: string;
  backupPath: string;
  hadExisting: boolean;
}

function writeAllWorkflowsToDefaultConfig(): ConfigBackup | null {
  const configPath = getSpecKitDefaultConfigPath();
  const backupPath = configPath + '.zcw-backup';
  let hadExisting = false;

  try {
    hadExisting = fs.existsSync(configPath);
    if (hadExisting) {
      fs.copyFileSync(configPath, backupPath);
    }

    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, ALL_WORKFLOWS_CONFIG, 'utf-8');

    return { configPath, backupPath, hadExisting };
  } catch {
    if (hadExisting) {
      try {
        fs.unlinkSync(backupPath);
      } catch {
        // Best-effort cleanup.
      }
    }
    return null;
  }
}

function restoreDefaultConfig(backup: ConfigBackup | null): void {
  if (!backup) return;
  try {
    if (backup.hadExisting) {
      fs.copyFileSync(backup.backupPath, backup.configPath);
      fs.unlinkSync(backup.backupPath);
    } else if (fs.existsSync(backup.configPath)) {
      fs.unlinkSync(backup.configPath);
    }
  } catch {
    // Best-effort restore.
  }
}

function isCommandAvailable(command: string): boolean {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checker, [command], { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function ensureSpecKitCli(
  _scope: InstallScope,
  _projectPath: string,
  _shouldInstall = true,
): Promise<'ready' | 'missing' | 'failed'> {
  if (isCommandAvailable('specify')) return 'ready';

  console.warn(
    '    Spec Kit CLI not found. Install github/spec-kit so the `specify` command is on PATH.',
  );
  return 'missing';
}

function migrateOpenCodeSpecKitPaths(homeDir: string): void {
  const opencodePlatform = PLATFORMS.find((p) => p.id === 'opencode');
  if (!opencodePlatform?.globalSkillsDir) return;

  const wrongDir = path.join(homeDir, opencodePlatform.skillsDir);
  const correctDir = path.join(homeDir, opencodePlatform.globalSkillsDir);

  const migrations: Array<[string, string, string]> = [
    [path.join(wrongDir, 'skills'), path.join(correctDir, 'skills'), 'skills'],
    [path.join(wrongDir, 'commands'), path.join(correctDir, 'commands'), 'commands'],
  ];

  for (const [srcDir, destDir, label] of migrations) {
    if (srcDir === destDir) continue;
    if (!fs.existsSync(srcDir)) continue;
    try {
      const entries = fs.readdirSync(srcDir);
      if (entries.length === 0) continue;

      fs.mkdirSync(destDir, { recursive: true });
      for (const entry of entries) {
        const srcPath = path.join(srcDir, entry);
        const destPath = path.join(destDir, entry);
        fs.cpSync(srcPath, destPath, { recursive: true, force: true });
      }
      fs.rmSync(srcDir, { recursive: true, force: true });
    } catch (error) {
      console.error(
        `    Warning: failed to migrate Spec Kit ${label} from ${srcDir} to ${destDir}: ${(error as Error).message}`,
      );
    }
  }

  if (fs.existsSync(wrongDir)) {
    try {
      const remaining = fs.readdirSync(wrongDir);
      if (remaining.length === 0) {
        fs.rmdirSync(wrongDir);
      }
    } catch {
      // Best-effort cleanup.
    }
  }
}

async function installSpecKit(
  projectPath: string,
  toolIds: string[],
  scope: InstallScope,
  shouldInstallCli = true,
): Promise<'installed' | 'failed' | 'skipped'> {
  const cliStatus = await ensureSpecKitCli(scope, projectPath, shouldInstallCli);
  if (cliStatus === 'failed') {
    console.error('    Spec Kit CLI is not available.');
    return 'failed';
  }
  if (cliStatus === 'missing') {
    return 'skipped';
  }

  const unknownIds = toolIds.filter((id) => !VALID_TOOL_IDS.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`Unknown integration IDs: ${unknownIds.join(', ')}`);
  }

  let configHome: string | undefined;
  let configBackup: ConfigBackup | null = null;
  try {
    const specKitEnv = createSpecKitAllWorkflowsEnv();
    configHome = specKitEnv.configHome;

    configBackup = writeAllWorkflowsToDefaultConfig();

    const invocation = buildSpecKitInitInvocation(projectPath, toolIds, scope);
    execFileSync(invocation.command, invocation.args, {
      cwd: projectPath,
      env: specKitEnv.env,
      stdio: ['inherit', 'inherit', 'pipe'],
      timeout: 120_000,
      shell: process.platform === 'win32',
    });

    if (scope === 'global' && toolIds.includes('opencode')) {
      migrateOpenCodeSpecKitPaths(os.homedir());
    }

    return 'installed';
  } catch (error) {
    console.error(`    Spec Kit init failed: ${(error as Error).message}`);
    printCommandErrorDetails(error);
    return 'failed';
  } finally {
    restoreDefaultConfig(configBackup);
    if (configHome) {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  }
}

export {
  installSpecKit,
  isCommandAvailable,
  buildSpecKitInitInvocation,
  getNpmExecutable,
  migrateOpenCodeSpecKitPaths,
};
