import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import { fileExists, readDir } from '../utils/file-system.js';
import { isCommandAvailable } from '../core/speckit.js';
import { hasCodegraphProjectIndex, resolveCodegraphCommand } from '../core/codegraph.js';
import { readManifest, getAssetsDir } from '../core/skills.js';
import { PLATFORMS, getPlatformSkillsDirs } from '../core/platforms.js';
import { readBridgeStatus } from '../core/bridge.js';
import type { InstallScope } from '../core/types.js';

interface CheckResult {
  check: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

type DoctorScope = InstallScope | 'auto';

const VALID_YAML_FIELDS = new Set([
  'workflow',
  'phase',
  'build_mode',
  'isolation',
  'verify_mode',
  'verify_result',
  'design_doc',
  'plan',
  'verification_report',
  'branch_status',
  'archived',
  'verified_at',
]);

function collectTopLevelYamlKeys(yamlContent: string): string[] {
  const topLevelKeys: string[] = [];

  for (const line of yamlContent.split(/\r?\n/u)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;
    if (/^\s/u.test(line)) continue;
    if (trimmedLine.startsWith('- ')) continue;

    const keyMatch = line.match(/^['"]?([A-Za-z0-9_-]+)['"]?\s*:/u);
    if (keyMatch) {
      topLevelKeys.push(keyMatch[1]);
    }
  }

  return topLevelKeys;
}

async function checkSpecKitCli(): Promise<CheckResult> {
  if (!isCommandAvailable('specify')) {
    return {
      check: 'Spec Kit CLI',
      status: 'warn',
      message: 'not installed - install github/spec-kit so the specify command is on PATH',
    };
  }
  try {
    const version = execSync('specify --version', { stdio: 'pipe', timeout: 10_000 })
      .toString()
      .trim();
    return { check: 'Spec Kit CLI', status: 'pass', message: `installed (${version})` };
  } catch {
    return { check: 'Spec Kit CLI', status: 'pass', message: 'installed' };
  }
}

async function checkWorkingDirs(projectPath: string): Promise<CheckResult> {
  const specsDir = path.join(projectPath, 'specs');
  const zcwDir = path.join(projectPath, '.zcw');
  const specsExist = await fileExists(specsDir);
  const zcwExist = await fileExists(zcwDir);

  if (specsExist && zcwExist) {
    return { check: 'working directories', status: 'pass', message: 'present' };
  }
  if (!specsExist && !zcwExist) {
    return { check: 'working directories', status: 'fail', message: 'missing - run: zcw init' };
  }

  const missing = [];
  if (!specsExist) missing.push('specs');
  if (!zcwExist) missing.push('.zcw');
  return {
    check: 'working directories',
    status: 'warn',
    message: `partial (missing: ${missing.join(', ')})`,
  };
}

function getScopeBases(
  projectPath: string,
  scope: DoctorScope,
): Array<{
  scope: InstallScope;
  baseDir: string;
}> {
  if (scope === 'project') return [{ scope, baseDir: projectPath }];
  if (scope === 'global') return [{ scope, baseDir: os.homedir() }];

  const bases: Array<{ scope: InstallScope; baseDir: string }> = [
    { scope: 'project', baseDir: projectPath },
  ];
  if (path.resolve(projectPath) !== path.resolve(os.homedir())) {
    bases.push({ scope: 'global', baseDir: os.homedir() });
  }
  return bases;
}

async function checkSkillCompleteness(
  projectPath: string,
  scope: DoctorScope,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const manifest = await readManifest();

  let anyPlatform = false;
  for (const base of getScopeBases(projectPath, scope)) {
    for (const platform of PLATFORMS) {
      const detectedSkillsDir = (
        await Promise.all(
          getPlatformSkillsDirs(platform, base.scope).map(async (skillsDir) => ({
            skillsDir,
            exists: await fileExists(path.join(base.baseDir, skillsDir, 'skills')),
          })),
        )
      ).find((candidate) => candidate.exists)?.skillsDir;
      if (!detectedSkillsDir) continue;

      const skillsDir = path.join(base.baseDir, detectedSkillsDir, 'skills');
      if (!(await fileExists(skillsDir))) continue;
      anyPlatform = true;

      const missing: string[] = [];
      for (const relPath of manifest.skills) {
        const fullPath = path.join(base.baseDir, detectedSkillsDir, 'skills', relPath);
        if (!(await fileExists(fullPath))) {
          missing.push(relPath);
        }
      }

      results.push(
        missing.length === 0
          ? {
              check: `skills: ${platform.name} (${base.scope})`,
              status: 'pass' as const,
              message: `complete (${manifest.skills.length} files)`,
            }
          : {
              check: `skills: ${platform.name} (${base.scope})`,
              status: 'warn' as const,
              message: `missing ${missing.length}: ${missing.join(', ')}`,
            },
      );
    }
  }

  if (!anyPlatform) {
    results.push({
      check: 'skills',
      status: 'warn',
      message:
        scope === 'auto'
          ? 'no platforms detected in project or global scope - run zcw init'
          : `no platforms detected in ${scope} scope - run zcw init`,
    });
  }

  return results;
}

async function checkScriptsPresent(): Promise<CheckResult> {
  const assetsDir = getAssetsDir();
  const scriptsDir = path.join(assetsDir, 'skills', 'zcw', 'scripts');
  if (!(await fileExists(scriptsDir))) {
    return { check: 'scripts present', status: 'warn', message: 'scripts directory not found' };
  }

  const entries = await readDir(scriptsDir);
  const shFiles = entries.filter((e) => e.endsWith('.sh'));

  return {
    check: 'scripts executable',
    status: 'pass',
    message: `OK (${shFiles.length} scripts)`,
  };
}

async function checkZCWYamlValidity(projectPath: string): Promise<CheckResult[]> {
  const changesDir = path.join(projectPath, 'specs');
  if (!(await fileExists(changesDir))) return [];

  const entries = await readDir(changesDir);
  const results: CheckResult[] = [];

  for (const entry of entries) {
    const yamlPath = path.join(changesDir, entry, '.zcw.yaml');
    if (!(await fileExists(yamlPath))) continue;

    const raw = await fs.readFile(yamlPath, 'utf-8');
    const unknownFields = collectTopLevelYamlKeys(raw).filter((key) => !VALID_YAML_FIELDS.has(key));

    results.push(
      unknownFields.length === 0
        ? { check: `.zcw.yaml: ${entry}`, status: 'pass' as const, message: 'valid' }
        : {
            check: `.zcw.yaml: ${entry}`,
            status: 'fail' as const,
            message: `unknown field(s): ${unknownFields.join(', ')}`,
          },
    );
  }

  return results;
}

async function checkCodegraph(projectPath: string, scope: DoctorScope): Promise<CheckResult> {
  if (scope !== 'global' && hasCodegraphProjectIndex(projectPath)) {
    return { check: 'CodeGraph', status: 'pass', message: 'initialized (.codegraph/ present)' };
  }

  if (!resolveCodegraphCommand(projectPath)) {
    return {
      check: 'CodeGraph CLI',
      status: 'warn',
      message: 'not installed - run npm install to restore package dependencies',
    };
  }

  if (scope === 'global') {
    return { check: 'CodeGraph CLI', status: 'pass', message: 'installed' };
  }

  const codegraphDir = path.join(projectPath, '.codegraph');
  if (!(await fileExists(codegraphDir))) {
    return {
      check: 'CodeGraph',
      status: 'warn',
      message: 'CLI installed but project not initialized - run: codegraph init -i',
    };
  }

  return { check: 'CodeGraph', status: 'pass', message: 'initialized (.codegraph/ present)' };
}

async function checkBridgeExtensionAssets(): Promise<CheckResult> {
  const assetsDir = getAssetsDir();
  const required = [
    'extension.yml',
    path.join('commands', 'zcw.execute.md'),
    path.join('commands', 'zcw.guard.md'),
    path.join('commands', 'zcw.handoff.md'),
  ];
  const missing: string[] = [];
  for (const relPath of required) {
    if (!(await fileExists(path.join(assetsDir, 'spec-kit-extension', relPath)))) {
      missing.push(relPath.replace(/\\/g, '/'));
    }
  }

  if (missing.length > 0) {
    return {
      check: 'Spec Kit extension assets',
      status: 'fail',
      message: `missing ${missing.length}: ${missing.join(', ')}`,
    };
  }

  return { check: 'Spec Kit extension assets', status: 'pass', message: 'present' };
}

async function checkBridgeState(projectPath: string): Promise<CheckResult> {
  const bridge = await readBridgeStatus(projectPath);
  if (bridge.state === 'corrupted') {
    return {
      check: 'bridge handoff',
      status: 'fail',
      message: bridge.error ?? 'corrupted handoff JSON',
    };
  }
  if (bridge.state === 'no-specify') {
    return { check: 'bridge handoff', status: 'warn', message: 'no .specify directory' };
  }
  if (bridge.state === 'no-handoff') {
    return {
      check: 'bridge handoff',
      status: 'warn',
      message: 'no .specify/superpowers-handoff.json',
    };
  }

  return {
    check: 'bridge handoff',
    status: 'pass',
    message: `${bridge.status} (${bridge.featureDirectory}, pending tasks: ${
      bridge.pendingTasks ?? 'unknown'
    })`,
  };
}

async function collectResults(projectPath: string, scope: DoctorScope): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  results.push(await checkSpecKitCli());
  if (scope !== 'global') {
    results.push(await checkWorkingDirs(projectPath));
  }
  results.push(...(await checkSkillCompleteness(projectPath, scope)));
  results.push(await checkScriptsPresent());
  results.push(await checkCodegraph(projectPath, scope));
  results.push(...(await checkZCWYamlValidity(projectPath)));
  return results;
}

async function collectReadinessResults(projectPath: string): Promise<CheckResult[]> {
  return [await checkBridgeExtensionAssets(), await checkBridgeState(projectPath)];
}

function icon(status: string): string {
  if (status === 'pass') return 'PASS';
  if (status === 'warn') return 'WARN';
  return 'FAIL';
}

interface DoctorOptions {
  json?: boolean;
  scope?: DoctorScope;
  readiness?: boolean;
}

export async function doctorCommand(
  targetPath: string,
  options: DoctorOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const scope = options.scope ?? 'auto';
  const results = await collectResults(projectPath, scope);
  if (options.readiness) {
    results.push(...(await collectReadinessResults(projectPath)));
  }

  if (options.json) {
    console.log(JSON.stringify({ scope, readiness: Boolean(options.readiness), results }, null, 2));
    return;
  }

  console.log(`Zen Flow Doctor (scope: ${scope}${options.readiness ? ', readiness' : ''})\n`);

  for (const r of results) {
    console.log(`  ${icon(r.status)} ${r.check}: ${r.message}`);
  }

  console.log();
}
