import path from 'path';
import { fileExists, readDir } from '../utils/file-system.js';
import { promises as fs } from 'fs';
import { readBridgeStatus } from '../core/bridge.js';
import { printBridgeStatus } from './bridge.js';
import { formatSessionNext, getNextWorkflowStep } from '../core/session.js';
import { formatNextRecommendation, recommendProjectNext } from './next.js';

type ZCWState = Record<string, string>;

interface ChangeStatus {
  name: string;
  workflow: string;
  phase: string;
  buildMode: string;
  isolation: string;
  verifyMode: string;
  verifyResult: string;
  designDoc: string | null;
  plan: string | null;
  tasksCompleted: number;
  tasksTotal: number;
  nextCommand: string | null;
}

function getNextCommand(phase: string): string | null {
  switch (phase) {
    case 'open':
      return '/zcw-open';
    case 'design':
      return '/zcw-design';
    case 'build':
      return '/zcw-build';
    case 'verify':
      return '/zcw-verify';
    case 'archive':
      return '/zcw-archive';
    default:
      return null;
  }
}

async function countTasks(tasksPath: string): Promise<{ done: number; total: number }> {
  if (!(await fileExists(tasksPath))) return { done: 0, total: 0 };
  const content = await fs.readFile(tasksPath, 'utf-8');
  const lines = content.split('\n');
  const total = lines.filter((l) => /^\s*- \[[ x]\]/.test(l)).length;
  const done = lines.filter((l) => /^\s*- \[x\]/i.test(l)).length;
  return { done, total };
}

async function readZCWState(changesDir: string, changeName: string): Promise<ZCWState | null> {
  const yamlPath = path.join(changesDir, changeName, '.zcw.yaml');
  if (!(await fileExists(yamlPath))) return null;
  const raw = await fs.readFile(yamlPath, 'utf-8');
  const state: ZCWState = {};
  for (const line of raw.split('\n')) {
    const stripped = line.replace(/\s+#.*$/, '');
    const match = stripped.match(/^(\w[\w_]*):\s*(.*)/);
    if (match) state[match[1]] = match[2].trim();
  }
  return state;
}

async function getActiveChanges(projectPath: string): Promise<ChangeStatus[]> {
  const changesDir = path.join(projectPath, 'specs');
  if (!(await fileExists(changesDir))) return [];

  const entries = await readDir(changesDir);
  const changes: ChangeStatus[] = [];

  for (const entry of entries) {
    const changeDir = path.join(changesDir, entry);
    const stat = await fs.stat(changeDir);
    if (!stat.isDirectory()) continue;

    const state = await readZCWState(changesDir, entry);
    if (!state) continue;
    if (state.archived === 'true') continue;

    const { done, total } = await countTasks(path.join(changeDir, 'tasks.md'));

    changes.push({
      name: entry,
      workflow: state.workflow ?? 'full',
      phase: state.phase ?? 'unknown',
      buildMode: state.build_mode ?? 'null',
      isolation: state.isolation ?? 'null',
      verifyMode: state.verify_mode ?? 'null',
      verifyResult: state.verify_result ?? 'pending',
      designDoc: state.design_doc === 'null' ? null : (state.design_doc ?? null),
      plan: state.plan === 'null' ? null : (state.plan ?? null),
      tasksCompleted: done,
      tasksTotal: total,
      nextCommand: getNextCommand(state.phase ?? 'unknown'),
    });
  }

  return changes;
}

function displayStatus(changes: ChangeStatus[]): void {
  if (changes.length === 0) {
    console.log('No active changes.\n');
    return;
  }

  console.log('Active Changes:\n');

  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    const taskStr = c.tasksTotal > 0 ? ` [${c.tasksCompleted}/${c.tasksTotal} tasks]` : '';
    console.log(`  ${i + 1}. ${c.name} [phase: ${c.phase}${taskStr}]`);
    console.log(`     workflow: ${c.workflow} | build_mode: ${c.buildMode}`);
    if (c.designDoc) console.log(`     design: ${c.designDoc}`);
    if (c.plan) console.log(`     plan:   ${c.plan}`);
    if (c.phase === 'verify') console.log(`     verify_result: ${c.verifyResult}`);
    if (c.nextCommand) console.log(`     next: ${c.nextCommand}`);
    console.log();
  }
}

interface StatusOptions {
  json?: boolean;
  bridge?: boolean;
  next?: boolean;
}

export async function statusCommand(
  targetPath: string,
  options: StatusOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const changes = await getActiveChanges(projectPath);
  const bridge = options.bridge ? await readBridgeStatus(projectPath) : null;
  const sessionNext = options.next ? await getNextWorkflowStep(projectPath) : null;
  const nextRecommendation = options.next ? await recommendProjectNext(projectPath) : null;

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          changes,
          ...(bridge ? { bridge } : {}),
          ...(options.next ? { sessionNext } : {}),
          ...(nextRecommendation ? { nextRecommendation } : {}),
        },
        null,
        2,
      ),
    );
    return;
  }

  displayStatus(changes);
  if (bridge) {
    printBridgeStatus(bridge);
  }
  if (options.next) {
    if (sessionNext) {
      console.log(formatSessionNext(sessionNext));
    } else {
      console.log('No ZCW session found.');
    }
    if (nextRecommendation) {
      console.log();
      console.log(formatNextRecommendation(nextRecommendation));
    }
  }
}
