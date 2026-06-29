import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isCommandAvailable, getNpmExecutable } from './speckit.js';
import { printCommandErrorDetails } from './command-error.js';

import type { InstallScope } from './types.js';

type CodegraphQueryMode = 'search' | 'callers' | 'context';

interface CodegraphStatus {
  command: string | null;
  cliInstalled: boolean;
  indexed: boolean;
  indexPath: string;
  indexEntries: string[];
  indexUpdatedAt: string | null;
  next: string;
}

interface CodegraphInitOptions {
  installCli?: boolean;
  force?: boolean;
}

interface CodegraphInitResult {
  status: 'initialized' | 'installed' | 'skipped' | 'failed';
  command: string | null;
  message: string;
}

interface CodegraphQueryOptions {
  mode: CodegraphQueryMode;
  query: string;
  limit?: number;
}

interface CodegraphQueryResult {
  mode: CodegraphQueryMode;
  query: string;
  command: string;
  args: string[];
  output: string;
}

function getPnpmExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

function commandCandidates(command: string): string[] {
  return process.platform === 'win32'
    ? [`${command}.cmd`, `${command}.exe`, `${command}.ps1`, command]
    : [command];
}

function resolveNodeModulesCommand(baseDir: string, command: string): string | null {
  const binDir = path.join(baseDir, 'node_modules', '.bin');
  for (const candidate of commandCandidates(command)) {
    const candidatePath = path.join(binDir, candidate);
    if (fs.existsSync(candidatePath)) return candidatePath;
  }
  return null;
}

function hasCodegraphProjectIndex(projectPath: string): boolean {
  const codegraphDir = path.join(projectPath, '.codegraph');
  try {
    if (!fs.statSync(codegraphDir).isDirectory()) return false;
    return fs.readdirSync(codegraphDir).some((entry) => entry !== '.gitignore');
  } catch {
    return false;
  }
}

function getCodegraphIndexEntries(projectPath: string): string[] {
  const codegraphDir = path.join(projectPath, '.codegraph');
  try {
    return fs
      .readdirSync(codegraphDir)
      .filter((entry) => entry !== '.gitignore')
      .sort();
  } catch {
    return [];
  }
}

function getCodegraphIndexUpdatedAt(projectPath: string): string | null {
  const codegraphDir = path.join(projectPath, '.codegraph');
  const entries = getCodegraphIndexEntries(projectPath);
  let latest = 0;

  for (const entry of entries) {
    try {
      const stat = fs.statSync(path.join(codegraphDir, entry));
      latest = Math.max(latest, stat.mtimeMs);
    } catch {
      // Ignore unreadable index files.
    }
  }

  return latest > 0 ? new Date(latest).toISOString() : null;
}

function resolvePnpmGlobalCommand(command: string): string | null {
  try {
    const binDir = execFileSync(getPnpmExecutable(), ['bin', '-g'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
      shell: process.platform === 'win32',
    }).trim();
    if (!binDir) return null;

    for (const candidate of commandCandidates(command)) {
      const candidatePath = path.join(binDir, candidate);
      if (fs.existsSync(candidatePath)) return candidatePath;
    }
  } catch {
    // pnpm may not be installed or may not have a global bin configured.
  }

  return null;
}

function resolveCodegraphCommand(projectPath?: string): string | null {
  if (projectPath) {
    const projectCommand = resolveNodeModulesCommand(projectPath, 'codegraph');
    if (projectCommand) return projectCommand;
  }

  const bundledCommand = resolveNodeModulesCommand(packageRoot(), 'codegraph');
  if (bundledCommand) return bundledCommand;

  if (isCommandAvailable('codegraph')) return 'codegraph';
  return resolvePnpmGlobalCommand('codegraph');
}

function getCodegraphStatus(projectPath: string): CodegraphStatus {
  const command = resolveCodegraphCommand(projectPath);
  const indexed = hasCodegraphProjectIndex(projectPath);
  const indexEntries = getCodegraphIndexEntries(projectPath);
  const next = !command
    ? 'Install dependencies or run: npm install'
    : indexed
      ? 'Use zcw graph search <query>'
      : 'Initialize the project index: zcw graph init';

  return {
    command,
    cliInstalled: command !== null,
    indexed,
    indexPath: path.join(projectPath, '.codegraph'),
    indexEntries,
    indexUpdatedAt: getCodegraphIndexUpdatedAt(projectPath),
    next,
  };
}

async function ensureCodegraphCli(
  projectPath: string,
  shouldInstall = true,
): Promise<string | null> {
  const existingCommand = resolveCodegraphCommand(projectPath);
  if (existingCommand) return existingCommand;
  if (!shouldInstall) return null;

  console.log('    Installing CodeGraph dependency...');
  try {
    execFileSync(getNpmExecutable(), ['install', '@colbymchenry/codegraph@^1.1.2', '--save'], {
      cwd: projectPath,
      stdio: 'inherit',
      timeout: 180_000,
      shell: process.platform === 'win32',
    });
    return resolveCodegraphCommand(projectPath);
  } catch (error) {
    console.error(`    Failed to install CodeGraph dependency: ${(error as Error).message}`);
    printCommandErrorDetails(error);
    return null;
  }
}

async function installCodegraph(
  projectPath: string,
  scope: InstallScope,
  shouldInstallCli = true,
): Promise<'installed' | 'failed' | 'skipped'> {
  if (hasCodegraphProjectIndex(projectPath)) {
    console.log('    CodeGraph: existing .codegraph index detected');
    return 'skipped';
  }

  const codegraphCommand = await ensureCodegraphCli(projectPath, shouldInstallCli);
  if (!codegraphCommand) {
    if (!shouldInstallCli) {
      console.log('    CodeGraph CLI not installed, skipping setup');
      return 'skipped';
    }
    console.error('    CodeGraph CLI not available. Install dependencies with: npm install');
    return 'failed';
  }

  try {
    console.log('    Running: codegraph install --yes');
    execFileSync(codegraphCommand, ['install', '--yes'], {
      cwd: projectPath,
      stdio: 'inherit',
      timeout: 120_000,
      shell: process.platform === 'win32',
    });
  } catch (error) {
    console.error(`    CodeGraph install failed: ${(error as Error).message}`);
    printCommandErrorDetails(error);
    return 'failed';
  }

  if (scope === 'project') {
    try {
      console.log('    Running: codegraph init -i');
      execFileSync(codegraphCommand, ['init', '-i'], {
        cwd: projectPath,
        stdio: 'inherit',
        timeout: 300_000,
        shell: process.platform === 'win32',
      });
    } catch (error) {
      console.error(`    CodeGraph init failed: ${(error as Error).message}`);
      printCommandErrorDetails(error);
      return 'failed';
    }
  }

  return 'installed';
}

async function initializeCodegraphProject(
  projectPath: string,
  options: CodegraphInitOptions = {},
): Promise<CodegraphInitResult> {
  const installCli = options.installCli ?? false;
  let command = await ensureCodegraphCli(projectPath, installCli);

  if (!command) {
    return {
      status: 'failed',
      command: null,
      message: 'CodeGraph CLI is not installed.',
    };
  }

  if (hasCodegraphProjectIndex(projectPath) && !options.force) {
    return {
      status: 'skipped',
      command,
      message: 'Existing .codegraph index detected.',
    };
  }

  try {
    execFileSync(command, ['install', '--yes'], {
      cwd: projectPath,
      stdio: 'inherit',
      timeout: 120_000,
      shell: process.platform === 'win32',
    });
    execFileSync(command, ['init', '-i'], {
      cwd: projectPath,
      stdio: 'inherit',
      timeout: 300_000,
      shell: process.platform === 'win32',
    });
  } catch (error) {
    printCommandErrorDetails(error);
    return {
      status: 'failed',
      command,
      message: (error as Error).message,
    };
  }

  command = resolveCodegraphCommand(projectPath) ?? command;
  return {
    status: 'initialized',
    command,
    message: 'CodeGraph project index initialized.',
  };
}

function queryArgs(options: CodegraphQueryOptions): string[][] {
  const limitArgs = options.limit ? ['--limit', String(options.limit)] : [];
  switch (options.mode) {
    case 'search':
      return [
        ['search', options.query, ...limitArgs],
        ['query', options.query, ...limitArgs],
        ['find', options.query, ...limitArgs],
      ];
    case 'callers':
      return [
        ['callers', options.query, ...limitArgs],
        ['query', `callers ${options.query}`, ...limitArgs],
      ];
    case 'context':
      return [
        ['context', options.query, ...limitArgs],
        ['query', `context ${options.query}`, ...limitArgs],
        ['search', options.query, ...limitArgs],
      ];
  }
}

function runCodegraphQuery(
  projectPath: string,
  options: CodegraphQueryOptions,
): CodegraphQueryResult {
  const query = options.query.trim();
  if (!query) throw new Error('CodeGraph query is required.');

  const command = resolveCodegraphCommand(projectPath);
  if (!command) {
    throw new Error('CodeGraph CLI is not installed. Install dependencies with: npm install');
  }

  if (!hasCodegraphProjectIndex(projectPath)) {
    throw new Error('CodeGraph index not found. Run: zcw graph init');
  }

  const candidates = queryArgs({ ...options, query });
  const failures: string[] = [];

  for (const args of candidates) {
    try {
      const output = execFileSync(command, args, {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
        shell: process.platform === 'win32',
      });
      return { mode: options.mode, query, command, args, output: output.trim() };
    } catch (error) {
      failures.push(`${command} ${args.join(' ')}: ${(error as Error).message}`);
    }
  }

  throw new Error(`CodeGraph ${options.mode} failed. Tried: ${failures.join(' | ')}`);
}

export {
  getCodegraphStatus,
  initializeCodegraphProject,
  installCodegraph,
  hasCodegraphProjectIndex,
  resolveCodegraphCommand,
  runCodegraphQuery,
};
export type {
  CodegraphInitOptions,
  CodegraphInitResult,
  CodegraphQueryMode,
  CodegraphQueryOptions,
  CodegraphQueryResult,
  CodegraphStatus,
};
