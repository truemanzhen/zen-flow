import path from 'path';
import { promises as fs } from 'fs';
import { ensureDir, fileExists, readDir, writeFile } from '../utils/file-system.js';

type BridgeHandoffStatus = 'ready' | 'executing' | 'blocked' | 'complete';
type BridgeStateKind = 'no-specify' | 'no-handoff' | 'corrupted' | 'parseable';

interface BridgeHandoff {
  status: BridgeHandoffStatus;
  feature_directory: string;
  artifact_owner: 'spec-kit';
  implementation_owner: 'superpowers';
  actor?: string;
  reason?: string;
  updated_at: string;
}

interface BridgeStatus {
  state: BridgeStateKind;
  handoffPath: string;
  featureDirectory: string | null;
  status: BridgeHandoffStatus | null;
  artifactOwner: string | null;
  actor: string;
  pendingTasks: number | null;
  next: string;
  error?: string;
}

interface BridgeEvent {
  timestamp: string;
  action: string;
  status: string;
  feature_directory?: string | null;
  actor: string;
  reason?: string;
  checked_action?: string;
  decision?: 'allow' | 'deny';
}

interface UpdateBridgeHandoffOptions {
  status: BridgeHandoffStatus;
  featureDirectory?: string;
  reason?: string;
  actor?: string;
}

interface GuardBridgeActionOptions {
  action: string;
  actor?: string;
  targetFeatureDirectory?: string;
  reason?: string;
}

interface GuardBridgeActionResult {
  decision: 'allow' | 'deny';
  reason: string;
  status: BridgeStatus;
}

const HANDOFF_RELATIVE_PATH = path.join('.specify', 'superpowers-handoff.json');
const EVENTS_RELATIVE_PATH = path.join('.specify', 'bridge-events.jsonl');

function timestampIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

function normalizeActor(actor: string | undefined): string {
  const normalized = actor?.trim().toLowerCase();
  if (normalized === 'codex' || normalized === 'claude') return normalized;
  return 'unknown';
}

function bridgePaths(projectPath: string): {
  specifyDir: string;
  handoffPath: string;
  eventsPath: string;
} {
  const specifyDir = path.join(projectPath, '.specify');
  return {
    specifyDir,
    handoffPath: path.join(projectPath, HANDOFF_RELATIVE_PATH),
    eventsPath: path.join(projectPath, EVENTS_RELATIVE_PATH),
  };
}

async function countPendingTasks(tasksPath: string): Promise<number | null> {
  if (!(await fileExists(tasksPath))) return null;
  const content = await fs.readFile(tasksPath, 'utf-8');
  return content.split(/\r?\n/u).filter((line) => /^\s*- \[ \]/u.test(line)).length;
}

async function hasSpecKitContract(projectPath: string, featureDirectory: string): Promise<boolean> {
  const featurePath = path.resolve(projectPath, featureDirectory);
  return (
    (await fileExists(path.join(featurePath, 'spec.md'))) &&
    (await fileExists(path.join(featurePath, 'plan.md')))
  );
}

async function inferFeatureDirectory(projectPath: string): Promise<string | null> {
  const specsDir = path.join(projectPath, 'specs');
  const entries = await readDir(specsDir);
  const candidates: Array<{ relative: string; mtimeMs: number }> = [];

  for (const entry of entries) {
    const featureDir = path.join(specsDir, entry);
    try {
      const stat = await fs.stat(featureDir);
      if (!stat.isDirectory()) continue;
      const tasksPath = path.join(featureDir, 'tasks.md');
      if (!(await fileExists(tasksPath))) continue;
      const tasksStat = await fs.stat(tasksPath);
      candidates.push({
        relative: path.join('specs', entry).replace(/\\/g, '/'),
        mtimeMs: tasksStat.mtimeMs,
      });
    } catch {
      // Ignore unreadable feature candidates; status/doctor will surface missing state elsewhere.
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.relative ?? null;
}

function isBridgeHandoff(value: unknown): value is BridgeHandoff {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const handoff = value as Record<string, unknown>;
  return (
    typeof handoff.status === 'string' &&
    ['ready', 'executing', 'blocked', 'complete'].includes(handoff.status) &&
    typeof handoff.feature_directory === 'string'
  );
}

function nextBridgeAction(status: BridgeStatus): string {
  if (status.state === 'no-specify') return 'run `specify init` or `zcw init` first';
  if (status.state === 'no-handoff') return 'run `/speckit-tasks`, then create a ZCW handoff';
  if (status.state === 'corrupted') return 'fix or remove `.specify/superpowers-handoff.json`';
  if (status.status === 'ready')
    return 'run `/zcw-build` to execute Spec Kit tasks with Superpowers';
  if (status.status === 'executing') {
    if (status.pendingTasks === 0)
      return 'run `/zcw-verify` and mark handoff complete after review';
    return 'continue `/zcw-build`';
  }
  if (status.status === 'blocked')
    return 'fix the recorded Spec Kit contract gap, then resume `/zcw-build`';
  if (status.status === 'complete') return 'run `/zcw-archive` or start the next feature';
  return 'inspect bridge state';
}

async function readBridgeStatus(projectPath: string, actor?: string): Promise<BridgeStatus> {
  const { specifyDir, handoffPath } = bridgePaths(projectPath);
  const normalizedActor = normalizeActor(actor);

  if (!(await fileExists(specifyDir))) {
    const status: BridgeStatus = {
      state: 'no-specify',
      handoffPath,
      featureDirectory: null,
      status: null,
      artifactOwner: null,
      actor: normalizedActor,
      pendingTasks: null,
      next: '',
    };
    status.next = nextBridgeAction(status);
    return status;
  }

  if (!(await fileExists(handoffPath))) {
    const status: BridgeStatus = {
      state: 'no-handoff',
      handoffPath,
      featureDirectory: null,
      status: null,
      artifactOwner: null,
      actor: normalizedActor,
      pendingTasks: null,
      next: '',
    };
    status.next = nextBridgeAction(status);
    return status;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(handoffPath, 'utf-8')) as unknown;
  } catch (error) {
    const status: BridgeStatus = {
      state: 'corrupted',
      handoffPath,
      featureDirectory: null,
      status: null,
      artifactOwner: null,
      actor: normalizedActor,
      pendingTasks: null,
      next: '',
      error: (error as Error).message,
    };
    status.next = nextBridgeAction(status);
    return status;
  }

  if (!isBridgeHandoff(parsed)) {
    const status: BridgeStatus = {
      state: 'corrupted',
      handoffPath,
      featureDirectory: null,
      status: null,
      artifactOwner: null,
      actor: normalizedActor,
      pendingTasks: null,
      next: '',
      error: 'handoff JSON does not match the ZCW bridge contract',
    };
    status.next = nextBridgeAction(status);
    return status;
  }

  const featureDirectory = parsed.feature_directory;
  const pendingTasks = await countPendingTasks(
    path.join(projectPath, featureDirectory, 'tasks.md'),
  );
  const status: BridgeStatus = {
    state: 'parseable',
    handoffPath,
    featureDirectory,
    status: parsed.status,
    artifactOwner: parsed.artifact_owner ?? null,
    actor: normalizeActor(parsed.actor ?? actor),
    pendingTasks,
    next: '',
  };
  status.next = nextBridgeAction(status);
  return status;
}

async function appendBridgeEvent(projectPath: string, event: BridgeEvent): Promise<void> {
  const { eventsPath } = bridgePaths(projectPath);
  await ensureDir(path.dirname(eventsPath));
  await fs.appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf-8');
}

async function updateBridgeHandoff(
  projectPath: string,
  options: UpdateBridgeHandoffOptions,
): Promise<BridgeHandoff> {
  const { specifyDir, handoffPath } = bridgePaths(projectPath);
  const existing = await readBridgeStatus(projectPath, options.actor);
  const featureDirectory =
    options.featureDirectory ??
    existing.featureDirectory ??
    (await inferFeatureDirectory(projectPath));

  if (!featureDirectory) {
    throw new Error('No Spec Kit feature directory found. Pass --feature specs/<name>.');
  }

  const handoff: BridgeHandoff = {
    status: options.status,
    feature_directory: featureDirectory.replace(/\\/g, '/'),
    artifact_owner: 'spec-kit',
    implementation_owner: 'superpowers',
    actor: normalizeActor(options.actor),
    updated_at: timestampIso(),
  };
  if (options.reason) handoff.reason = options.reason;

  await ensureDir(specifyDir);
  await writeFile(handoffPath, JSON.stringify(handoff, null, 2) + '\n');
  await appendBridgeEvent(projectPath, {
    timestamp: handoff.updated_at,
    action: 'handoff',
    status: handoff.status,
    feature_directory: handoff.feature_directory,
    actor: handoff.actor ?? 'unknown',
    reason: handoff.reason,
  });

  return handoff;
}

async function guardBridgeAction(
  projectPath: string,
  options: GuardBridgeActionOptions,
): Promise<GuardBridgeActionResult> {
  const action = options.action.trim();
  if (!action) throw new Error('--action is required');

  const status = await readBridgeStatus(projectPath, options.actor);
  let decision: 'allow' | 'deny' = 'allow';
  let reason = '';
  const featureDirectory = options.targetFeatureDirectory ?? status.featureDirectory;

  if (action === 'speckit.implement' && status.status === 'executing') {
    decision = 'deny';
    reason = 'speckit.implement is blocked while Superpowers handoff is executing';
  } else if (
    (action === 'superpowers:brainstorming' || action === 'superpowers:writing-plans') &&
    featureDirectory &&
    (await hasSpecKitContract(projectPath, featureDirectory))
  ) {
    decision = 'deny';
    reason = 'Superpowers planning is blocked because Spec Kit owns spec.md and plan.md';
  } else if (action === 'speckit.constitution' && status.status === 'executing') {
    decision = 'deny';
    reason = 'constitution changes are blocked during active handoff; mark handoff blocked first';
  }

  await appendBridgeEvent(projectPath, {
    timestamp: timestampIso(),
    action: 'guard',
    status: decision,
    decision,
    feature_directory: featureDirectory,
    actor: normalizeActor(options.actor),
    checked_action: action,
    reason: reason || options.reason,
  });

  return { decision, reason, status };
}

export {
  readBridgeStatus,
  updateBridgeHandoff,
  guardBridgeAction,
  HANDOFF_RELATIVE_PATH,
  EVENTS_RELATIVE_PATH,
};
export type {
  BridgeHandoff,
  BridgeHandoffStatus,
  BridgeStatus,
  GuardBridgeActionResult,
  UpdateBridgeHandoffOptions,
  GuardBridgeActionOptions,
};
