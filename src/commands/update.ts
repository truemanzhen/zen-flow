import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { select } from '@inquirer/prompts';
import { fileExists, readDir, readJson } from '../utils/file-system.js';
import { getBaseDir } from '../core/detect.js';
import {
  copyZCWSkillsForPlatform,
  copyZCWRulesForPlatform,
  createWorkingDirs,
  installZCWHooksForPlatform,
  installSpecKitExtension,
  getManifestSkills,
} from '../core/skills.js';
import { PLATFORMS, getPlatformSkillsDir, type Platform } from '../core/platforms.js';
import { hasCodegraphProjectIndex, installCodegraph } from '../core/codegraph.js';
import type { InstallScope } from '../core/types.js';
import { printVersionInfo } from '../core/version.js';
import { t, type TranslationKey } from './i18n.js';

const PACKAGE_NAME = '@rpamis/zcw';
const OFFICIAL_REGISTRY = 'https://registry.npmjs.org';

interface UpdateOptions {
  json?: boolean;
  language?: string;
  scope?: InstallScope;
  skipNpm?: boolean;
  dryRun?: boolean;
  setupOnly?: boolean;
}

type SkillLanguage = 'en' | 'zh';

interface InstalledZCWTarget {
  scope: InstallScope;
  platform: Platform;
  language: SkillLanguage;
}

interface DetectTargetsOptions {
  scopes?: InstallScope[];
  globalBaseDir?: string;
}

function languageToSkillsDir(language: string | undefined, fallback: SkillLanguage): string {
  return (language ?? fallback) === 'zh' ? 'skills-zh' : 'skills';
}

function getScopedBaseDir(
  scope: InstallScope,
  projectPath: string,
  globalBaseDir = os.homedir(),
): string {
  return scope === 'global' ? globalBaseDir : projectPath;
}

function getInstalledZCWSkillsDirs(
  baseDir: string,
  platform: Platform,
  scope: InstallScope = 'project',
): string[] {
  const dirs = [path.join(baseDir, getPlatformSkillsDir(platform, scope), 'skills')];
  if (scope === 'global' && platform.id === 'pi') {
    dirs.push(path.join(baseDir, platform.skillsDir, 'skills'));
  }
  return [...new Set(dirs)];
}

async function hasLocalZCWSkills(
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
): Promise<boolean> {
  for (const skillsDir of getInstalledZCWSkillsDirs(baseDir, platform, scope)) {
    if (!(await fileExists(skillsDir))) continue;
    const entries = await readDir(skillsDir);
    if (entries.some((entry) => entry.startsWith('zcw'))) return true;
  }
  return false;
}

async function detectInstalledZCWLanguage(
  baseDir: string,
  platform: Platform,
  scope: InstallScope = 'project',
): Promise<SkillLanguage> {
  for (const skillsDir of getInstalledZCWSkillsDirs(baseDir, platform, scope)) {
    if (!(await fileExists(skillsDir))) continue;
    const entries = (await readDir(skillsDir)).filter((entry) => entry.startsWith('zcw'));

    for (const entry of entries) {
      const skillPath = path.join(skillsDir, entry, 'SKILL.md');
      if (!(await fileExists(skillPath))) continue;

      try {
        const content = await fs.readFile(skillPath, 'utf-8');
        if (/[㐀-鿿]/u.test(content)) return 'zh';
      } catch {
        // Fall through to the default English asset set if the file cannot be read.
      }
    }
  }

  return 'en';
}

async function detectInstalledZCWTargets(
  projectPath: string,
  options: DetectTargetsOptions = {},
): Promise<InstalledZCWTarget[]> {
  const scopes = options.scopes ?? (['project', 'global'] as InstallScope[]);
  const targets: InstalledZCWTarget[] = [];

  for (const scope of scopes) {
    const baseDir = getScopedBaseDir(scope, projectPath, options.globalBaseDir);

    for (const platform of PLATFORMS) {
      if (!(await hasLocalZCWSkills(baseDir, platform, scope))) continue;

      targets.push({
        scope,
        platform,
        language: await detectInstalledZCWLanguage(baseDir, platform, scope),
      });
    }
  }

  return targets;
}

function isSameOrInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function detectZCWPackageScope(
  projectPath: string,
  packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'),
): Promise<InstallScope> {
  const localPackageRoot = path.join(projectPath, 'node_modules', '@rpamis', 'zcw');
  if (isSameOrInside(packageRoot, localPackageRoot)) return 'project';

  const packageJsonPath = path.join(projectPath, 'package.json');
  if (await fileExists(packageJsonPath)) {
    const pkg = await readJson<{
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    }>(packageJsonPath);

    if (
      pkg.dependencies?.[PACKAGE_NAME] ||
      pkg.devDependencies?.[PACKAGE_NAME] ||
      pkg.optionalDependencies?.[PACKAGE_NAME]
    ) {
      return 'project';
    }
  }

  return 'global';
}

function buildNpmUpdateArgs(scope: InstallScope): string[] {
  return scope === 'global'
    ? ['install', '-g', `${PACKAGE_NAME}@latest`, '--registry', OFFICIAL_REGISTRY]
    : ['install', `${PACKAGE_NAME}@latest`, '--registry', OFFICIAL_REGISTRY];
}

function formatNpmUpdateCommand(scope: InstallScope): string {
  return ['npm', ...buildNpmUpdateArgs(scope)].join(' ');
}

function formatSkillUpdateCommand(
  scope: InstallScope,
  platform: Platform,
  languageSkillsDir: string,
): string {
  const destPrefix = scope === 'global' ? '~/' : '';
  return `copy assets/${languageSkillsDir} -> ${destPrefix}${getPlatformSkillsDir(platform, scope)}/skills/ (${scope})`;
}

async function buildSpecKitExtensionPlan(
  projectPath: string,
  scope: InstallScope | undefined,
): Promise<{ planned: boolean; reason?: string }> {
  if (scope === 'global') {
    return { planned: false, reason: 'global scope does not install project Spec Kit extensions' };
  }
  if (!(await fileExists(path.join(projectPath, '.specify')))) {
    return { planned: false, reason: '.specify directory not found' };
  }
  return { planned: true };
}

function getNpmExecutable(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

async function updateZCWNpmPackage(
  scope: InstallScope,
  projectPath: string,
  log: (message: string) => void,
  jsonMode = false,
): Promise<boolean> {
  const args = buildNpmUpdateArgs(scope);
  const cwd = scope === 'global' ? process.cwd() : projectPath;

  return new Promise((resolve) => {
    // In JSON mode, discard npm's stdout/stderr so it cannot corrupt the JSON
    // document emitted on stdout. 'ignore' avoids the pipe backpressure a
    // verbose npm install could otherwise cause.
    const child = spawn(getNpmExecutable(), args, {
      cwd,
      stdio: jsonMode ? 'ignore' : 'inherit',
      shell: true,
    });
    child.on('error', (err) => {
      log(`  npm package: failed to launch npm — ${err.message}`);
      resolve(false);
    });
    child.on('exit', (code) => {
      if (code !== 0) {
        log(
          `  npm package: update failed (exit code ${code}). Unable to reach the official npm registry at ${OFFICIAL_REGISTRY}.`,
        );
        log(`  Check your network connection or firewall settings and try again.`);
      }
      resolve(code === 0);
    });
  });
}

async function promptCodegraphInstall(lang: string): Promise<boolean> {
  return select({
    message: t(lang, 'installCodegraph'),
    choices: [
      { name: t(lang, 'codegraphYes'), value: true },
      { name: t(lang, 'codegraphNo'), value: false },
    ],
  });
}

export async function updateCommand(
  targetPath: string,
  options: UpdateOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const log = options.json ? () => undefined : console.log;

  const lang = options.language ?? 'en';

  log(`\n  ${t(lang, 'updateTitle')}`);
  if (!options.json) {
    await printVersionInfo(log);
  }
  log('');

  const packageScope = options.scope ?? (await detectZCWPackageScope(projectPath));
  let npmStatus: 'updated' | 'failed' | 'skipped' = 'skipped';
  const npmSkipped =
    options.skipNpm === true || options.setupOnly === true || options.dryRun === true;
  if (!npmSkipped) {
    log(`  ${t(lang, 'updatingNpmPackage')} (${packageScope} scope)...`);
    log(`    $ ${formatNpmUpdateCommand(packageScope)}`);
    const npmUpdated = await updateZCWNpmPackage(
      packageScope,
      projectPath,
      log,
      options.json === true,
    );
    if (npmUpdated) {
      npmStatus = 'updated';
      log(`  ${t(lang, 'npmPackageUpdated')} ${PACKAGE_NAME}`);
    } else {
      npmStatus = 'failed';
      log(`  ${t(lang, 'npmPackageFailed')}`);
    }
  } else if (!options.json && options.dryRun) {
    log(`  npm package: would run $ ${formatNpmUpdateCommand(packageScope)}`);
  } else if (!options.json && options.setupOnly) {
    log('  npm package: skipped (--setup-only)');
  }

  const targets = await detectInstalledZCWTargets(projectPath, {
    scopes: options.scope ? [options.scope] : undefined,
  });
  const specKitExtensionPlan = await buildSpecKitExtensionPlan(projectPath, options.scope);
  const plannedTargets = targets.map((target) => {
    const language = options.language ?? target.language;
    const languageSkillsDir = languageToSkillsDir(options.language, target.language);
    const scopeLabel = target.scope === 'global' ? 'global' : `project (${projectPath})`;
    return {
      scope: target.scope,
      platform: target.platform.id,
      platformName: target.platform.name,
      language,
      source: languageSkillsDir,
      command: formatSkillUpdateCommand(target.scope, target.platform, languageSkillsDir),
      label: `${target.platform.name} (${scopeLabel}, ${language})`,
      supportsHooks: Boolean(target.platform.supportsHooks),
    };
  });

  if (options.dryRun) {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            setupOnly: Boolean(options.setupOnly),
            npm: {
              scope: packageScope,
              status: 'planned',
              command: formatNpmUpdateCommand(packageScope),
              skipped: npmSkipped,
            },
            skills: { targets: plannedTargets },
            rules: { planned: plannedTargets.length },
            hooks: {
              planned: plannedTargets.filter((target) => target.supportsHooks).length,
            },
            workingDirs: {
              planned: options.setupOnly === true && options.scope !== 'global',
            },
            specKitExtension: specKitExtensionPlan,
            codegraph: 'skipped',
          },
          null,
          2,
        ),
      );
      return;
    }

    log('\n  Dry run plan:');
    if (plannedTargets.length === 0) {
      log('    No installed ZCW targets detected.');
    } else {
      for (const target of plannedTargets) {
        log(`    - ${target.label}`);
        log(`      $ ${target.command}`);
        if (target.supportsHooks) log('      hooks: would refresh');
      }
    }
    if (options.setupOnly && options.scope !== 'global') {
      log('    working dirs: would ensure specs/ and .zcw/config.yaml');
    }
    log(
      specKitExtensionPlan.planned
        ? '    Spec Kit extension: would refresh .specify/extensions/zcw'
        : `    Spec Kit extension: skipped (${specKitExtensionPlan.reason})`,
    );
    log('\n  No files changed.\n');
    return;
  }

  if (targets.length === 0) {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            npm: {
              scope: npmSkipped ? 'skipped' : packageScope,
              status: npmStatus,
              command: npmSkipped ? null : formatNpmUpdateCommand(packageScope),
            },
            skills: { totalCopied: 0, targets: [] },
            rules: { totalCopied: 0 },
            hooks: { totalInstalled: 0 },
            workingDirs: { ensured: false },
            specKitExtension: specKitExtensionPlan,
            codegraph: 'skipped',
          },
          null,
          2,
        ),
      );
      return;
    }
    log(`\n  ${t(lang, 'noInstallsFound')}\n`);
    return;
  }

  log(`\n  ${t(lang, 'updatingSkillsOnTargets')} ${targets.length} target(s):`);
  for (const target of plannedTargets) {
    log(`    - ${target.label}`);
    log(`      $ ${target.command}`);
  }

  log(
    `\n  ${t(lang, 'copyingSkillsFiles')} ${(await getManifestSkills()).length} skill files...\n`,
  );

  let totalCopied = 0;
  let totalRulesCopied = 0;
  let totalHooksInstalled = 0;
  let workingDirsEnsured = false;
  const targetResults = [];
  if (options.setupOnly && options.scope !== 'global') {
    await createWorkingDirs(projectPath);
    workingDirsEnsured = true;
    log('  Working directories: ensured');
  }

  const specKitExtension =
    specKitExtensionPlan.planned && options.scope !== 'global'
      ? await installSpecKitExtension(projectPath, true)
      : { installed: false, reason: specKitExtensionPlan.reason ?? 'not planned' };
  if (specKitExtension.installed) {
    log('  ZCW Spec Kit extension: updated');
  } else if (specKitExtension.reason) {
    log(`  ZCW Spec Kit extension: skipped (${specKitExtension.reason})`);
  }

  for (const target of targets) {
    const baseDir = getBaseDir(target.scope, projectPath);
    const languageSkillsDir = languageToSkillsDir(options.language, target.language);
    const { copied, skipped } = await copyZCWSkillsForPlatform(
      baseDir,
      target.platform,
      true,
      languageSkillsDir,
      target.scope,
    );
    totalCopied += copied;
    targetResults.push({
      scope: target.scope,
      platform: target.platform.id,
      platformName: target.platform.name,
      language: options.language ?? target.language,
      source: languageSkillsDir,
      copied,
      skipped,
      command: formatSkillUpdateCommand(target.scope, target.platform, languageSkillsDir),
    });
    log(
      `  ${target.platform.name} (${target.scope}, ${languageSkillsDir}): ${copied} ${t(lang, 'skillsCopiedSkipped')} ${skipped} skipped`,
    );

    try {
      const { copied: ruleCopied } = await copyZCWRulesForPlatform(
        baseDir,
        target.platform,
        true,
        target.scope,
      );
      totalRulesCopied += ruleCopied;
      if (ruleCopied > 0) {
        log(`  ZCW rules -> ${target.platform.name}: ${ruleCopied} ${t(lang, 'rulesUpdated')}`);
      }
    } catch (err) {
      log(
        `  ZCW rules -> ${target.platform.name}: ${t(lang, 'rulesFailed')} (${(err as Error).message})`,
      );
    }

    if (target.platform.supportsHooks) {
      try {
        const { installed, reason } = await installZCWHooksForPlatform(
          baseDir,
          target.platform,
          target.scope,
        );
        if (installed) {
          totalHooksInstalled++;
          log(`  ZCW hooks -> ${target.platform.name}: ${t(lang, 'hooksUpdated')}`);
        } else if (reason) {
          log(`  ZCW hooks -> ${target.platform.name}: ${t(lang, 'hooksSkipped')} (${reason})`);
        }
      } catch (err) {
        log(
          `  ZCW hooks -> ${target.platform.name}: ${t(lang, 'hooksFailed')} (${(err as Error).message})`,
        );
      }
    }
  }

  let codegraphStatus: 'installed' | 'failed' | 'skipped' = 'skipped';
  const primaryScope = targets[0]?.scope ?? 'project';
  const codegraphAlreadyIndexed = hasCodegraphProjectIndex(projectPath);

  if (options.json) {
    codegraphStatus = 'skipped';
  } else if (codegraphAlreadyIndexed) {
    log('\n  CodeGraph: skipped (existing .codegraph index detected)');
  } else {
    const shouldInstallCodegraph = npmSkipped ? false : await promptCodegraphInstall(lang);

    if (shouldInstallCodegraph) {
      log(`\n  ${t(lang, 'installingCG')}`);
      codegraphStatus = await installCodegraph(projectPath, primaryScope, true);
      log(`  CodeGraph: ${codegraphStatus}`);
    } else {
      log(`\n  CodeGraph: ${t(lang, 'cgSkippedByUser')}`);
    }
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          npm: {
            scope: npmSkipped ? 'skipped' : packageScope,
            status: npmStatus,
            command: npmSkipped ? null : formatNpmUpdateCommand(packageScope),
          },
          skills: {
            totalCopied,
            targets: targetResults,
          },
          rules: { totalCopied: totalRulesCopied },
          hooks: { totalInstalled: totalHooksInstalled },
          workingDirs: { ensured: workingDirsEnsured },
          specKitExtension,
          codegraph: codegraphStatus,
        },
        null,
        2,
      ),
    );
    return;
  }

  const languages = [...new Set(targetResults.map((target) => target.language))].join(', ');
  const scopes = [...new Set(targetResults.map((target) => target.scope))].join(', ');
  log(`\n  ${t(lang, 'summary')}`);
  log(`    ${t(lang, 'summaryNpm')} ${npmStatus}${npmSkipped ? '' : ` (${packageScope})`}`);
  log(`    ${t(lang, 'summarySkills')} ${targets.length} target(s), ${totalCopied} files updated`);
  log(
    `    Spec Kit extension: ${specKitExtension.installed ? 'updated' : `skipped (${specKitExtension.reason})`}`,
  );
  log(`    ${t(lang, 'summaryCodegraph')} ${codegraphStatus}`);
  log(`    ${t(lang, 'summaryScope')} ${scopes}`);
  log(`    ${t(lang, 'summaryLanguage')} ${languages}`);
  log(`\n  ${t(lang, 'updateComplete')}\n`);
}

export {
  buildNpmUpdateArgs,
  detectZCWPackageScope,
  detectInstalledZCWLanguage,
  detectInstalledZCWTargets,
  formatNpmUpdateCommand,
  formatSkillUpdateCommand,
};
export type { InstalledZCWTarget, SkillLanguage, TranslationKey };
