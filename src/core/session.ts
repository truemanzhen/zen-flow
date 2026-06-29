import path from 'path';
import { promises as fs } from 'fs';
import { ensureDir, fileExists, readDir, readJson, writeFile } from '../utils/file-system.js';
import { runCodegraphQuery, type CodegraphQueryResult } from './codegraph.js';
import { loadKnowledgeContext, type KnowledgeSearchResult } from './knowledge.js';

type ZCWChainName = 'feature' | 'hotfix' | 'tweak' | 'bridge';
type ZCWSessionStatus = 'running' | 'completed' | 'aborted';
type ZCWStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

interface ZCWSessionStep {
  index: number;
  id: string;
  command: string;
  description: string;
  status: ZCWStepStatus;
  completion_confirmed: boolean;
  completion_summary: string | null;
  completed_at: string | null;
}

interface ZCWSessionPlan {
  intent: string;
  chainName: ZCWChainName;
  taskType: ZCWChainName;
  steps: ZCWSessionStep[];
}

interface ZCWKnowledgeContext {
  query: string;
  loadedAt: string;
  skipped: boolean;
  entries: KnowledgeSearchResult[];
  codegraph: CodegraphQueryResult | null;
  warnings: string[];
}

interface ZCWSession extends ZCWSessionPlan {
  sessionId: string;
  status: ZCWSessionStatus;
  createdAt: string;
  updatedAt: string;
  sessionPath: string;
  knowledgeContext: ZCWKnowledgeContext;
}

interface SessionNextStep {
  session: ZCWSession;
  step: ZCWSessionStep | null;
}

interface CreateWorkflowSessionOptions {
  knowledge?: boolean;
  code?: boolean;
}

const SESSION_ROOT_RELATIVE = path.join('.zcw', 'sessions');

function timestampIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

function timestampForId(): string {
  return new Date().toISOString().replace(/\D/gu, '').slice(0, 14);
}

function normalizeIntent(intent: string): string {
  return intent.trim().replace(/\s+/gu, ' ');
}

function makeStep(index: number, command: string, description: string): ZCWSessionStep {
  return {
    index,
    id: `S${index + 1}`,
    command,
    description,
    status: 'pending',
    completion_confirmed: false,
    completion_summary: null,
    completed_at: null,
  };
}

function classifyIntent(intent: string): ZCWChainName {
  const normalized = normalizeIntent(intent).toLowerCase();
  if (/(hotfix|bug|fix|error|fail|crash|修复|报错|失败|故障|异常)/u.test(normalized)) {
    return 'hotfix';
  }
  if (/(tweak|typo|copy|rename|style|small|minor|微调|小改|文案|重命名|样式)/u.test(normalized)) {
    return 'tweak';
  }
  if (/(handoff|tasks\.md|bridge|已有.*tasks|执行.*任务|交接)/u.test(normalized)) {
    return 'bridge';
  }
  return 'feature';
}

function stepsForChain(chainName: ZCWChainName): ZCWSessionStep[] {
  const chains: Record<ZCWChainName, Array<[string, string]>> = {
    feature: [
      ['/zcw-open', 'Clarify requirements and create Spec Kit artifacts'],
      ['/zcw-design', 'Create Superpowers design handoff and technical plan'],
      ['/zcw-build', 'Execute tasks with Superpowers implementation discipline'],
      ['/zcw-verify', 'Verify implementation, review, and handle branch state'],
      ['/zcw-archive', 'Archive the completed Spec Kit change'],
    ],
    hotfix: [
      ['/zcw-hotfix', 'Create and execute a focused bug-fix workflow'],
      ['/zcw-verify', 'Verify the fix and handle branch state'],
      ['/zcw-archive', 'Archive the completed hotfix'],
    ],
    tweak: [
      ['/zcw-tweak', 'Create and execute a small-change workflow'],
      ['/zcw-verify', 'Verify the tweak and handle branch state'],
      ['/zcw-archive', 'Archive the completed tweak'],
    ],
    bridge: [
      ['zcw bridge handoff --status ready', 'Create the Spec Kit to Superpowers handoff'],
      ['/zcw-build', 'Execute existing Spec Kit tasks with Superpowers'],
      ['/zcw-verify', 'Verify implementation, review, and handle branch state'],
      ['/zcw-archive', 'Archive the completed handoff'],
    ],
  };

  return chains[chainName].map(([command, description], index) =>
    makeStep(index, command, description),
  );
}

function planWorkflow(intent: string): ZCWSessionPlan {
  const normalized = normalizeIntent(intent);
  if (!normalized) throw new Error('Intent is required.');
  const chainName = classifyIntent(normalized);
  return {
    intent: normalized,
    chainName,
    taskType: chainName,
    steps: stepsForChain(chainName),
  };
}

function sessionsRoot(projectPath: string): string {
  return path.join(projectPath, SESSION_ROOT_RELATIVE);
}

function sessionStatusPath(sessionPath: string): string {
  return path.join(sessionPath, 'status.json');
}

async function loadSessionKnowledgeContext(
  projectPath: string,
  query: string,
  options: CreateWorkflowSessionOptions = {},
): Promise<ZCWKnowledgeContext> {
  const loadedAt = timestampIso();
  if (options.knowledge === false) {
    return {
      query,
      loadedAt,
      skipped: true,
      entries: [],
      codegraph: null,
      warnings: ['Knowledge load skipped by --no-knowledge.'],
    };
  }

  const warnings: string[] = [];
  let entries: KnowledgeSearchResult[] = [];
  try {
    entries = await loadKnowledgeContext(projectPath, query);
  } catch (error) {
    warnings.push(`Knowledge load failed: ${(error as Error).message}`);
  }

  let codegraph: CodegraphQueryResult | null = null;
  if (options.code) {
    try {
      codegraph = runCodegraphQuery(projectPath, { mode: 'search', query });
    } catch (error) {
      warnings.push(`CodeGraph load failed: ${(error as Error).message}`);
    }
  }

  return {
    query,
    loadedAt,
    skipped: false,
    entries,
    codegraph,
    warnings,
  };
}

async function createWorkflowSession(
  projectPath: string,
  intent: string,
  options: CreateWorkflowSessionOptions = {},
): Promise<ZCWSession> {
  const plan = planWorkflow(intent);
  const now = timestampIso();
  const sessionId = `zcw-${timestampForId()}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionPath = path.join(sessionsRoot(projectPath), sessionId);
  const knowledgeContext = await loadSessionKnowledgeContext(projectPath, plan.intent, options);

  const session: ZCWSession = {
    ...plan,
    sessionId,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    sessionPath,
    knowledgeContext,
  };

  await ensureDir(sessionPath);
  await writeFile(sessionStatusPath(sessionPath), JSON.stringify(session, null, 2) + '\n');
  return session;
}

function getNextPendingStep(session: ZCWSession): ZCWSessionStep | null {
  return (
    session.steps.find((step) => step.status === 'pending' || step.status === 'running') ?? null
  );
}

async function readSession(statusPath: string): Promise<ZCWSession> {
  return readJson<ZCWSession>(statusPath);
}

async function getLatestWorkflowSession(projectPath: string): Promise<ZCWSession | null> {
  const root = sessionsRoot(projectPath);
  const entries = await readDir(root);
  const candidates: Array<{ statusPath: string; mtimeMs: number }> = [];

  for (const entry of entries) {
    const statusPath = sessionStatusPath(path.join(root, entry));
    if (!(await fileExists(statusPath))) continue;
    try {
      const stat = await fs.stat(statusPath);
      candidates.push({ statusPath, mtimeMs: stat.mtimeMs });
    } catch {
      // Ignore unreadable sessions; a later doctor check can flag filesystem issues.
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0] ? readSession(candidates[0].statusPath) : null;
}

async function getNextWorkflowStep(projectPath: string): Promise<SessionNextStep | null> {
  const session = await getLatestWorkflowSession(projectPath);
  if (!session) return null;
  return { session, step: getNextPendingStep(session) };
}

function formatPlan(plan: ZCWSessionPlan): string {
  const lines = [
    `Chain: ${plan.chainName}`,
    `Intent: ${plan.intent}`,
    '',
    'Steps:',
    ...plan.steps.map((step) => `  ${step.index + 1}. ${step.command} - ${step.description}`),
  ];
  return lines.join('\n');
}

function formatSessionNext(next: SessionNextStep): string {
  if (!next.step) {
    return `Session: ${next.session.sessionId}\nNext: (none)\nStatus: ${next.session.status}`;
  }
  return [
    `Session: ${next.session.sessionId}`,
    `Chain: ${next.session.chainName}`,
    `Next: ${next.step.command}`,
    `Step: ${next.step.index + 1}/${next.session.steps.length} - ${next.step.description}`,
    `State: ${next.session.sessionPath}`,
  ].join('\n');
}

export {
  SESSION_ROOT_RELATIVE,
  planWorkflow,
  createWorkflowSession,
  getLatestWorkflowSession,
  getNextWorkflowStep,
  getNextPendingStep,
  formatPlan,
  formatSessionNext,
};
export type {
  ZCWChainName,
  ZCWSession,
  ZCWSessionPlan,
  ZCWSessionStatus,
  ZCWSessionStep,
  ZCWStepStatus,
  ZCWKnowledgeContext,
  SessionNextStep,
  CreateWorkflowSessionOptions,
};
