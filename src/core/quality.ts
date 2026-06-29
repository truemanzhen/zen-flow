import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { collectDashboardSnapshot } from '../dashboard/collector.js';
import { collectGitSnapshot } from '../dashboard/git.js';
import { fileExists, readDir, readJson, writeFile } from '../utils/file-system.js';
import { getLatestWorkflowSession } from './session.js';

type QualityKind = 'audit' | 'test' | 'review';
type QualityStatus = 'pass' | 'warn' | 'fail';

interface QualityCheck {
  id: string;
  status: QualityStatus;
  message: string;
  detail?: string;
}

interface QualityResult {
  kind: QualityKind;
  status: QualityStatus;
  createdAt: string;
  projectPath: string;
  summary: string;
  checks: QualityCheck[];
  artifacts: {
    latest: string;
    run: string;
    session?: string;
  };
  data?: Record<string, unknown>;
}

interface TestQualityOptions {
  script?: string;
}

const QUALITY_ROOT_RELATIVE = path.join('.zcw', 'quality');
const QUALITY_RUNS_RELATIVE = path.join(QUALITY_ROOT_RELATIVE, 'runs');

function timestampIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/\D/gu, '').slice(0, 14);
}

function worstStatus(checks: QualityCheck[]): QualityStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

function summarize(kind: QualityKind, status: QualityStatus, checks: QualityCheck[]): string {
  const failed = checks.filter((check) => check.status === 'fail').length;
  const warned = checks.filter((check) => check.status === 'warn').length;
  return `${kind} ${status}: ${failed} failed, ${warned} warned, ${checks.length} checks`;
}

async function syncLatestSession(
  projectPath: string,
  result: QualityResult,
): Promise<string | undefined> {
  const session = await getLatestWorkflowSession(projectPath);
  if (!session) return undefined;

  const statusPath = path.join(session.sessionPath, 'status.json');
  const raw = await readJson<Record<string, unknown>>(statusPath);
  const existing = (raw.qualityResults as Record<string, unknown>) ?? {};
  raw.qualityResults = {
    ...existing,
    [result.kind]: {
      status: result.status,
      summary: result.summary,
      createdAt: result.createdAt,
      artifact: result.artifacts.latest,
    },
  };
  raw.updatedAt = result.createdAt;
  await writeFile(statusPath, JSON.stringify(raw, null, 2) + '\n');
  return statusPath;
}

async function persistQualityResult(
  projectPath: string,
  result: Omit<QualityResult, 'artifacts'>,
): Promise<QualityResult> {
  const latest = path.join(projectPath, QUALITY_ROOT_RELATIVE, `${result.kind}-latest.json`);
  const run = path.join(
    projectPath,
    QUALITY_RUNS_RELATIVE,
    `${timestampForFile()}-${result.kind}.json`,
  );
  const complete: QualityResult = {
    ...result,
    artifacts: { latest, run },
  };

  const sessionPath = await syncLatestSession(projectPath, complete);
  if (sessionPath) complete.artifacts.session = sessionPath;

  const content = JSON.stringify(complete, null, 2) + '\n';
  await writeFile(run, content);
  await writeFile(latest, content);
  return complete;
}

async function runAudit(projectPath: string): Promise<QualityResult> {
  const snapshot = await collectDashboardSnapshot(projectPath);
  const session = await getLatestWorkflowSession(projectPath);
  const checks: QualityCheck[] = [];

  if (!session) {
    checks.push({
      id: 'session.present',
      status: 'warn',
      message: 'No ZCW session found.',
    });
  } else {
    const doneWithoutSummary = session.steps.filter(
      (step) => step.status === 'done' && (!step.completion_confirmed || !step.completion_summary),
    );
    checks.push({
      id: 'session.completion-evidence',
      status: doneWithoutSummary.length === 0 ? 'pass' : 'warn',
      message:
        doneWithoutSummary.length === 0
          ? 'Completed session steps have summaries.'
          : `${doneWithoutSummary.length} completed step(s) are missing completion evidence.`,
    });
  }

  if (snapshot.changes.active.length === 0) {
    checks.push({
      id: 'change.active',
      status: 'warn',
      message: 'No active Spec Kit change found.',
    });
  }

  for (const change of snapshot.changes.active) {
    const missingArtifacts = Object.entries(change.artifacts)
      .filter(([, present]) => !present)
      .map(([name]) => name);
    checks.push({
      id: `change.${change.name}.artifacts`,
      status: missingArtifacts.length === 0 ? 'pass' : 'warn',
      message:
        missingArtifacts.length === 0
          ? `${change.name} has expected artifacts.`
          : `${change.name} missing artifact(s): ${missingArtifacts.join(', ')}`,
    });

    if (change.phase === 'build') {
      checks.push({
        id: `change.${change.name}.build-plan`,
        status: change.artifacts.plan ? 'pass' : 'fail',
        message: change.artifacts.plan
          ? `${change.name} has a build plan.`
          : `${change.name} is in build without plan.md.`,
      });
    }

    if (change.phase === 'verify') {
      checks.push({
        id: `change.${change.name}.verify-report`,
        status: change.verify.reportExists ? 'pass' : 'warn',
        message: change.verify.reportExists
          ? `${change.name} has a verification report.`
          : `${change.name} is in verify without a verification report.`,
      });
    }

    if (change.phase === 'archive') {
      checks.push({
        id: `change.${change.name}.archive-ready`,
        status: change.verify.result === 'pass' ? 'pass' : 'fail',
        message:
          change.verify.result === 'pass'
            ? `${change.name} passed verify before archive.`
            : `${change.name} is in archive without verify pass.`,
      });
    }
  }

  if (snapshot.git.dirtyFiles > 0) {
    checks.push({
      id: 'git.dirty',
      status: 'warn',
      message: `${snapshot.git.dirtyFiles} dirty file(s) in git working tree.`,
      detail: snapshot.git.dirtyFileList.join('\n'),
    });
  } else {
    checks.push({
      id: 'git.clean',
      status: 'pass',
      message: 'Git working tree is clean or project is not a git repository.',
    });
  }

  const status = worstStatus(checks);
  return persistQualityResult(projectPath, {
    kind: 'audit',
    status,
    createdAt: timestampIso(),
    projectPath,
    summary: summarize('audit', status, checks),
    checks,
    data: {
      activeChanges: snapshot.summary.activeChanges,
      archivedChanges: snapshot.summary.archivedChanges,
      dirtyFiles: snapshot.git.dirtyFiles,
    },
  });
}

async function readPackageScripts(projectPath: string): Promise<Record<string, string>> {
  const packagePath = path.join(projectPath, 'package.json');
  if (!(await fileExists(packagePath))) return {};
  const raw = await fs.readFile(packagePath, 'utf-8');
  const pkg = JSON.parse(raw.replace(/^\uFEFF/u, '')) as { scripts?: Record<string, string> };
  return pkg.scripts ?? {};
}

async function detectPackageRunner(
  projectPath: string,
): Promise<{ command: string; args: string[] }> {
  if (await fileExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['run'] };
  }
  if (await fileExists(path.join(projectPath, 'bun.lockb'))) {
    return { command: 'bun', args: ['run'] };
  }
  return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run'] };
}

async function runTests(
  projectPath: string,
  options: TestQualityOptions = {},
): Promise<QualityResult> {
  const script = options.script?.trim() || 'test';
  const scripts = await readPackageScripts(projectPath);
  const checks: QualityCheck[] = [];
  const started = Date.now();

  if (!scripts[script]) {
    checks.push({
      id: 'test.script',
      status: 'fail',
      message: `package.json script not found: ${script}`,
    });
    const status = worstStatus(checks);
    return persistQualityResult(projectPath, {
      kind: 'test',
      status,
      createdAt: timestampIso(),
      projectPath,
      summary: summarize('test', status, checks),
      checks,
      data: { script },
    });
  }

  const runner = await detectPackageRunner(projectPath);
  const args = [...runner.args, script];
  const result = spawnSync(runner.command, args, {
    cwd: projectPath,
    encoding: 'utf-8',
    timeout: 300_000,
    shell: process.platform === 'win32',
  });
  const durationMs = Date.now() - started;
  const exitCode = result.status ?? (result.error ? 1 : 0);

  checks.push({
    id: 'test.command',
    status: exitCode === 0 ? 'pass' : 'fail',
    message:
      exitCode === 0
        ? `Test script passed: ${runner.command} ${args.join(' ')}`
        : `Test script failed with exit code ${exitCode}: ${runner.command} ${args.join(' ')}`,
    detail: result.error?.message,
  });

  const status = worstStatus(checks);
  return persistQualityResult(projectPath, {
    kind: 'test',
    status,
    createdAt: timestampIso(),
    projectPath,
    summary: summarize('test', status, checks),
    checks,
    data: {
      command: runner.command,
      args,
      exitCode,
      durationMs,
      stdout: result.stdout?.slice(0, 20_000) ?? '',
      stderr: result.stderr?.slice(0, 20_000) ?? '',
    },
  });
}

async function readTextIfSmall(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > 500_000) return null;
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function collectTodoFindings(
  projectPath: string,
  relativeFiles: string[],
): Promise<string[]> {
  const findings: string[] = [];
  for (const relative of relativeFiles.slice(0, 50)) {
    const fullPath = path.join(projectPath, relative);
    const content = await readTextIfSmall(fullPath);
    if (!content) continue;
    const lines = content.split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (/\b(TODO|FIXME)\b/u.test(line)) {
        findings.push(`${relative}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  return findings.slice(0, 50);
}

function sensitiveDirtyFiles(files: string[]): string[] {
  return files.filter((file) =>
    /(^|\/)(\.env|\.npmrc|\.pypirc|id_rsa|id_ed25519)|\.(pem|key|p12|pfx)$/iu.test(
      file.replace(/\\/gu, '/'),
    ),
  );
}

async function runReview(projectPath: string): Promise<QualityResult> {
  const git = await collectGitSnapshot(projectPath);
  const checks: QualityCheck[] = [];
  const dirtyFiles = git.dirtyFileList;
  const todos = await collectTodoFindings(projectPath, dirtyFiles);
  const sensitive = sensitiveDirtyFiles(dirtyFiles);
  const lockfiles = dirtyFiles.filter((file) =>
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|bun\.lockb)$/u.test(file),
  );

  checks.push({
    id: 'review.git-dirty',
    status: git.dirtyFiles === 0 ? 'pass' : 'warn',
    message:
      git.dirtyFiles === 0
        ? 'No dirty git files detected.'
        : `${git.dirtyFiles} dirty git file(s) detected.`,
    detail: dirtyFiles.join('\n'),
  });

  checks.push({
    id: 'review.todos',
    status: todos.length === 0 ? 'pass' : 'warn',
    message:
      todos.length === 0
        ? 'No TODO/FIXME markers found in dirty files.'
        : `${todos.length} TODO/FIXME marker(s) found in dirty files.`,
    detail: todos.join('\n'),
  });

  checks.push({
    id: 'review.sensitive-files',
    status: sensitive.length === 0 ? 'pass' : 'fail',
    message:
      sensitive.length === 0
        ? 'No sensitive dirty file paths detected.'
        : `Sensitive dirty file path(s): ${sensitive.join(', ')}`,
  });

  checks.push({
    id: 'review.lockfiles',
    status: lockfiles.length === 0 ? 'pass' : 'warn',
    message:
      lockfiles.length === 0
        ? 'No lockfile changes detected.'
        : `Lockfile change(s): ${lockfiles.join(', ')}`,
  });

  const status = worstStatus(checks);
  return persistQualityResult(projectPath, {
    kind: 'review',
    status,
    createdAt: timestampIso(),
    projectPath,
    summary: summarize('review', status, checks),
    checks,
    data: {
      branch: git.branch,
      head: git.head,
      dirtyFiles: git.dirtyFiles,
      dirtyFileList: dirtyFiles,
      todos,
      sensitive,
      lockfiles,
    },
  });
}

async function listQualityArtifacts(projectPath: string): Promise<string[]> {
  return readDir(path.join(projectPath, QUALITY_ROOT_RELATIVE));
}

export {
  QUALITY_ROOT_RELATIVE,
  QUALITY_RUNS_RELATIVE,
  listQualityArtifacts,
  runAudit,
  runReview,
  runTests,
};
export type { QualityCheck, QualityKind, QualityResult, QualityStatus, TestQualityOptions };
