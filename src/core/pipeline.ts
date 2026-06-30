import path from 'path';
import { readDir, readJson, writeFile } from '../utils/file-system.js';
import { runCodegraphQuery, type CodegraphQueryResult } from './codegraph.js';
import { loadKnowledgeContext, type KnowledgeSearchResult } from './knowledge.js';
import { planWorkflow, type ZCWChainName } from './session.js';

type PipelineScope = 'small' | 'medium' | 'large';
type ExecutionMode = 'executing-plans' | 'subagent-driven-development';
type TddMode = 'tdd' | 'direct';
type ReviewMode = 'off' | 'standard' | 'thorough';
type PipelineStepStatus = 'pending' | 'running' | 'done' | 'blocked';

interface PipelineKnowledgeContext {
  query: string;
  loadedAt: string;
  entries: KnowledgeSearchResult[];
  codegraph: CodegraphQueryResult | null;
  warnings: string[];
}

interface SuperpowersBinding {
  stage: 'design' | 'planning' | 'execution' | 'testing' | 'review' | 'debugging';
  skill: string;
  required: boolean;
  trigger: string;
  purpose: string;
}

interface PipelineNextAction {
  command: string;
  reason: string;
}

interface PipelineAnalysis {
  id: string;
  intent: string;
  taskType: ZCWChainName;
  scopeVerdict: PipelineScope;
  createdAt: string;
  projectPath: string;
  summary: string;
  impact: {
    keywords: string[];
    likelyArtifacts: string[];
    knowledgeMatches: number;
    codegraphIncluded: boolean;
  };
  superpowers: SuperpowersBinding[];
  knowledgeContext: PipelineKnowledgeContext;
  next: PipelineNextAction;
  artifacts: {
    json: string;
    markdown: string;
  };
}

interface PipelinePlanTask {
  id: string;
  title: string;
  command: string;
  superpowersSkill?: string;
  status: PipelineStepStatus;
  acceptance: string;
}

interface PipelinePlan {
  id: string;
  analysisId: string | null;
  intent: string;
  taskType: ZCWChainName;
  scopeVerdict: PipelineScope;
  executionMode: ExecutionMode;
  tddMode: TddMode;
  reviewMode: ReviewMode;
  createdAt: string;
  projectPath: string;
  tasks: PipelinePlanTask[];
  superpowers: SuperpowersBinding[];
  next: PipelineNextAction;
  artifacts: {
    json: string;
    markdown: string;
  };
}

interface PipelineExecution {
  id: string;
  planId: string;
  intent: string;
  status: 'ready';
  createdAt: string;
  projectPath: string;
  steps: PipelinePlanTask[];
  superpowers: SuperpowersBinding[];
  next: PipelineNextAction;
  artifacts: {
    json: string;
    markdown: string;
  };
}

interface CreatePipelineAnalysisOptions {
  code?: boolean;
}

interface CreatePipelinePlanOptions {
  analysisId?: string;
  intent?: string;
  executionMode?: ExecutionMode;
  tddMode?: TddMode;
  reviewMode?: ReviewMode;
}

interface CreatePipelineExecutionOptions {
  planId: string;
}

const PIPELINE_ROOT_RELATIVE = path.join('.zcw', 'pipeline');

function timestampIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

function timestampForId(): string {
  return new Date().toISOString().replace(/\D/gu, '').slice(0, 14);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

function normalizeIntent(intent: string): string {
  const normalized = intent.trim().replace(/\s+/gu, ' ');
  if (!normalized) throw new Error('Intent is required.');
  return normalized;
}

function pipelineRoot(projectPath: string): string {
  return path.join(projectPath, PIPELINE_ROOT_RELATIVE);
}

function artifactDir(projectPath: string, kind: 'analyses' | 'plans' | 'executions'): string {
  return path.join(pipelineRoot(projectPath), kind);
}

function artifactPath(
  projectPath: string,
  kind: 'analyses' | 'plans' | 'executions',
  id: string,
  extension: 'json' | 'md',
): string {
  return path.join(artifactDir(projectPath, kind), `${id}.${extension}`);
}

function idFor(prefix: 'ANL' | 'PLN' | 'EXE'): string {
  return `${prefix}-${timestampForId()}-${randomSuffix()}`;
}

function keywordsFor(intent: string): string[] {
  return Array.from(
    new Set(
      intent
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fa5]+/u)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2),
    ),
  ).slice(0, 8);
}

function inferScope(intent: string, knowledgeMatches: number): PipelineScope {
  const normalized = intent.toLowerCase();
  if (
    /(architecture|platform|migration|rewrite|roadmap|multi-module|架构|平台|迁移|重写|多个模块|全局)/u.test(
      normalized,
    )
  ) {
    return 'large';
  }
  if (/(typo|copy|rename|style|small|minor|微调|文案|重命名|小改)/u.test(normalized)) {
    return 'small';
  }
  if (/(bug|fix|hotfix|crash|error|修复|报错|故障)/u.test(normalized)) {
    return 'small';
  }
  if (knowledgeMatches >= 4 || normalized.split(/\s+/u).length >= 18) {
    return 'large';
  }
  return 'medium';
}

function defaultExecutionMode(scope: PipelineScope): ExecutionMode {
  return scope === 'large' ? 'subagent-driven-development' : 'executing-plans';
}

function defaultReviewMode(scope: PipelineScope): ReviewMode {
  if (scope === 'small') return 'standard';
  return 'thorough';
}

function baseSuperpowersBindings(
  taskType: ZCWChainName,
  executionMode: ExecutionMode,
  tddMode: TddMode,
  reviewMode: ReviewMode,
): SuperpowersBinding[] {
  const bindings: SuperpowersBinding[] = [];

  if (taskType === 'feature' || taskType === 'bridge') {
    bindings.push(
      {
        stage: 'design',
        skill: 'brainstorming',
        required: true,
        trigger: '/zcw-design',
        purpose:
          'Explore implementation approaches and confirm the technical design before writing the Design Doc.',
      },
      {
        stage: 'planning',
        skill: 'writing-plans',
        required: true,
        trigger: '/zcw-build',
        purpose:
          'Convert the confirmed Design Doc and Spec Kit tasks into an executable Superpowers plan.',
      },
      {
        stage: 'execution',
        skill: executionMode,
        required: true,
        trigger: '/zcw-build',
        purpose:
          executionMode === 'subagent-driven-development'
            ? 'Coordinate background agents per task using the ZCW subagent-dispatch extension.'
            : 'Execute the written implementation plan in the main working session.',
      },
    );
  }

  bindings.push({
    stage: 'debugging',
    skill: 'systematic-debugging',
    required: true,
    trigger: '/zcw-build',
    purpose:
      'Investigate test, build, runtime, or behavioral failures before changing source code.',
  });

  if (tddMode === 'tdd') {
    bindings.push({
      stage: 'testing',
      skill: 'test-driven-development',
      required: true,
      trigger: '/zcw-build',
      purpose:
        taskType === 'feature' || taskType === 'bridge'
          ? 'Run the Red-Green-Refactor loop before implementation tasks.'
          : 'Use TDD when a preset workflow explicitly upgrades from direct execution.',
    });
  }

  if (reviewMode !== 'off') {
    bindings.push({
      stage: 'review',
      skill: 'requesting-code-review',
      required: reviewMode === 'thorough',
      trigger: taskType === 'tweak' ? '/zcw-verify' : '/zcw-build',
      purpose: 'Review implementation before the build phase transitions to verify.',
    });
  }

  return bindings;
}

async function loadPipelineKnowledge(
  projectPath: string,
  query: string,
  includeCode = false,
): Promise<PipelineKnowledgeContext> {
  const loadedAt = timestampIso();
  const warnings: string[] = [];
  let entries: KnowledgeSearchResult[] = [];
  try {
    entries = await loadKnowledgeContext(projectPath, query);
  } catch (error) {
    warnings.push(`Knowledge load failed: ${(error as Error).message}`);
  }

  let codegraph: CodegraphQueryResult | null = null;
  if (includeCode) {
    try {
      codegraph = runCodegraphQuery(projectPath, { mode: 'search', query });
    } catch (error) {
      warnings.push(`CodeGraph search failed: ${(error as Error).message}`);
    }
  }

  return { query, loadedAt, entries, codegraph, warnings };
}

function likelyArtifacts(taskType: ZCWChainName): string[] {
  if (taskType === 'hotfix')
    return ['specs/<change>/tasks.md', 'docs/superpowers/plans/<date>-hotfix.md'];
  if (taskType === 'tweak')
    return ['specs/<change>/tasks.md', 'docs/superpowers/plans/<date>-tweak.md'];
  if (taskType === 'bridge')
    return [
      'specs/<change>/.zcw/handoff/design-context.md',
      'docs/superpowers/plans/<date>-feature.md',
    ];
  return [
    'specs/<change>/spec.md',
    'specs/<change>/plan.md',
    'specs/<change>/tasks.md',
    'docs/superpowers/specs/<date>-design.md',
    'docs/superpowers/plans/<date>-feature.md',
  ];
}

function renderBindings(bindings: SuperpowersBinding[]): string {
  return bindings
    .map(
      (binding) =>
        `- ${binding.stage}: Superpowers \`${binding.skill}\` via \`${binding.trigger}\` (${binding.required ? 'required' : 'conditional'}) - ${binding.purpose}`,
    )
    .join('\n');
}

function renderAnalysisMarkdown(analysis: PipelineAnalysis): string {
  return [
    `# ZCW Analysis ${analysis.id}`,
    '',
    `- Intent: ${analysis.intent}`,
    `- Task type: ${analysis.taskType}`,
    `- Scope verdict: ${analysis.scopeVerdict}`,
    `- Created: ${analysis.createdAt}`,
    '',
    '## Summary',
    '',
    analysis.summary,
    '',
    '## Impact',
    '',
    `- Keywords: ${analysis.impact.keywords.join(', ') || 'none'}`,
    `- Knowledge matches: ${analysis.impact.knowledgeMatches}`,
    `- CodeGraph included: ${analysis.impact.codegraphIncluded ? 'yes' : 'no'}`,
    `- Likely artifacts: ${analysis.impact.likelyArtifacts.join(', ')}`,
    '',
    '## Superpowers Binding',
    '',
    renderBindings(analysis.superpowers),
    '',
    '## Next',
    '',
    `Run \`${analysis.next.command}\` because ${analysis.next.reason}`,
    '',
  ].join('\n');
}

function planTasks(plan: {
  taskType: ZCWChainName;
  scopeVerdict: PipelineScope;
  executionMode: ExecutionMode;
  tddMode: TddMode;
  reviewMode: ReviewMode;
}): PipelinePlanTask[] {
  if (plan.taskType === 'hotfix') {
    return [
      {
        id: 'P1',
        title: 'Run hotfix preset workflow',
        command: '/zcw-hotfix',
        status: 'pending',
        acceptance: 'Hotfix Spec Kit artifacts exist and the workflow has entered build.',
      },
      {
        id: 'P2',
        title: 'Fix root cause and verify with debugging discipline',
        command: '/zcw-hotfix',
        superpowersSkill: 'systematic-debugging',
        status: 'pending',
        acceptance: 'Root cause is eliminated, relevant tests pass, and tasks.md is checked off.',
      },
      {
        id: 'P3',
        title: 'Verify and archive hotfix',
        command: '/zcw-verify -> /zcw-archive',
        status: 'pending',
        acceptance: 'Verification passes and the hotfix is archived.',
      },
    ];
  }

  if (plan.taskType === 'tweak') {
    return [
      {
        id: 'P1',
        title: 'Run tweak preset workflow',
        command: '/zcw-tweak',
        status: 'pending',
        acceptance: 'Tweak Spec Kit artifacts exist and the workflow has entered build.',
      },
      {
        id: 'P2',
        title: 'Apply lightweight change',
        command: '/zcw-tweak',
        superpowersSkill: 'systematic-debugging',
        status: 'pending',
        acceptance:
          'Tasks are completed, tests/build checks pass, and failures used systematic debugging.',
      },
      {
        id: 'P3',
        title: 'Verify and archive tweak',
        command: '/zcw-verify -> /zcw-archive',
        status: 'pending',
        acceptance: 'Lightweight verification passes and the tweak is archived.',
      },
    ];
  }

  const entryCommand =
    plan.taskType === 'bridge' ? 'zcw bridge handoff --status ready' : '/zcw-open';

  const tasks: PipelinePlanTask[] = [
    {
      id: 'P1',
      title: 'Prepare Spec Kit change and ZCW state',
      command: entryCommand,
      status: 'pending',
      acceptance: 'Spec Kit artifacts and .zcw.yaml exist for the target change.',
    },
    {
      id: 'P2',
      title: 'Run Superpowers design exploration',
      command: '/zcw-design',
      superpowersSkill: 'brainstorming',
      status: 'pending',
      acceptance: 'Design Doc is confirmed and recorded as design_doc in .zcw.yaml.',
    },
    {
      id: 'P3',
      title: 'Create implementation plan',
      command: '/zcw-build',
      superpowersSkill: 'writing-plans',
      status: 'pending',
      acceptance: 'A docs/superpowers/plans/*.md plan exists and is recorded in .zcw.yaml.',
    },
    {
      id: 'P4',
      title: 'Execute implementation with selected Superpowers method',
      command: '/zcw-build',
      superpowersSkill: plan.executionMode,
      status: 'pending',
      acceptance: `Implementation follows ${plan.executionMode}, tdd_mode=${plan.tddMode}, review_mode=${plan.reviewMode}.`,
    },
    {
      id: 'P5',
      title: 'Verify quality and discover follow-up issues',
      command: 'zcw audit && zcw test && zcw review && zcw issue discover',
      status: 'pending',
      acceptance: 'Quality artifacts exist and non-passing checks are tracked as ZCW issues.',
    },
    {
      id: 'P6',
      title: 'Verify and archive the Spec Kit change',
      command: '/zcw-verify -> /zcw-archive',
      status: 'pending',
      acceptance: 'Verification passes and the change is archived.',
    },
  ];

  if (plan.tddMode === 'tdd') {
    tasks.splice(4, 0, {
      id: 'P4a',
      title: 'Enforce TDD evidence',
      command: '/zcw-build',
      superpowersSkill: 'test-driven-development',
      status: 'pending',
      acceptance: 'RED and GREEN evidence is recorded before task checkoff.',
    });
  }

  return tasks;
}

function renderPlanMarkdown(plan: PipelinePlan): string {
  return [
    `# ZCW Plan ${plan.id}`,
    '',
    `- Intent: ${plan.intent}`,
    `- Analysis: ${plan.analysisId ?? 'none'}`,
    `- Scope verdict: ${plan.scopeVerdict}`,
    `- Execution mode: ${plan.executionMode}`,
    `- TDD mode: ${plan.tddMode}`,
    `- Review mode: ${plan.reviewMode}`,
    '',
    '## Superpowers Contract',
    '',
    renderBindings(plan.superpowers),
    '',
    '## Tasks',
    '',
    ...plan.tasks.map(
      (task) =>
        `- [ ] ${task.id} ${task.title}\n  - Command: \`${task.command}\`${task.superpowersSkill ? `\n  - Superpowers: \`${task.superpowersSkill}\`` : ''}\n  - Acceptance: ${task.acceptance}`,
    ),
    '',
    '## Next',
    '',
    `Run \`${plan.next.command}\` because ${plan.next.reason}`,
    '',
  ].join('\n');
}

function renderExecutionMarkdown(execution: PipelineExecution): string {
  return [
    `# ZCW Execution ${execution.id}`,
    '',
    `- Plan: ${execution.planId}`,
    `- Intent: ${execution.intent}`,
    `- Status: ${execution.status}`,
    '',
    '## Superpowers Contract',
    '',
    renderBindings(execution.superpowers),
    '',
    '## Execution Steps',
    '',
    ...execution.steps.map(
      (step) =>
        `- [ ] ${step.id} ${step.title}\n  - Command: \`${step.command}\`${step.superpowersSkill ? `\n  - Superpowers: \`${step.superpowersSkill}\`` : ''}\n  - Acceptance: ${step.acceptance}`,
    ),
    '',
    '## Next',
    '',
    `Run \`${execution.next.command}\` because ${execution.next.reason}`,
    '',
  ].join('\n');
}

async function persistArtifact<T extends { artifacts: { json: string; markdown: string } }>(
  artifact: T,
  markdown: string,
): Promise<T> {
  await writeFile(artifact.artifacts.json, JSON.stringify(artifact, null, 2) + '\n');
  await writeFile(artifact.artifacts.markdown, markdown);
  return artifact;
}

async function createPipelineAnalysis(
  projectPath: string,
  intent: string,
  options: CreatePipelineAnalysisOptions = {},
): Promise<PipelineAnalysis> {
  const normalizedIntent = normalizeIntent(intent);
  const plan = planWorkflow(normalizedIntent);
  const knowledgeContext = await loadPipelineKnowledge(projectPath, normalizedIntent, options.code);
  const scopeVerdict = inferScope(normalizedIntent, knowledgeContext.entries.length);
  const executionMode = defaultExecutionMode(scopeVerdict);
  const id = idFor('ANL');
  const createdAt = timestampIso();
  const artifacts = {
    json: artifactPath(projectPath, 'analyses', id, 'json'),
    markdown: artifactPath(projectPath, 'analyses', id, 'md'),
  };
  const analysis: PipelineAnalysis = {
    id,
    intent: normalizedIntent,
    taskType: plan.taskType,
    scopeVerdict,
    createdAt,
    projectPath,
    summary: `${plan.taskType} task with ${scopeVerdict} scope; use Spec Kit for WHAT and Superpowers for HOW.`,
    impact: {
      keywords: keywordsFor(normalizedIntent),
      likelyArtifacts: likelyArtifacts(plan.taskType),
      knowledgeMatches: knowledgeContext.entries.length,
      codegraphIncluded: Boolean(knowledgeContext.codegraph),
    },
    superpowers: baseSuperpowersBindings(
      plan.taskType,
      executionMode,
      'tdd',
      defaultReviewMode(scopeVerdict),
    ),
    knowledgeContext,
    next: {
      command: `zcw plan --from ${id}`,
      reason: 'the analysis artifact is ready to become a Superpowers-aware execution plan.',
    },
    artifacts,
  };

  return persistArtifact(analysis, renderAnalysisMarkdown(analysis));
}

async function readArtifactById<T>(
  projectPath: string,
  kind: 'analyses' | 'plans' | 'executions',
  id: string,
): Promise<T> {
  const dir = artifactDir(projectPath, kind);
  const files = await readDir(dir);
  const match = files.find((file) => file === `${id}.json`);
  if (!match) throw new Error(`Pipeline artifact not found: ${id}`);
  return readJson<T>(path.join(dir, match));
}

async function getPipelineAnalysis(projectPath: string, id: string): Promise<PipelineAnalysis> {
  return readArtifactById<PipelineAnalysis>(projectPath, 'analyses', id);
}

async function getPipelinePlan(projectPath: string, id: string): Promise<PipelinePlan> {
  return readArtifactById<PipelinePlan>(projectPath, 'plans', id);
}

async function createPipelinePlan(
  projectPath: string,
  options: CreatePipelinePlanOptions = {},
): Promise<PipelinePlan> {
  const analysis = options.analysisId
    ? await getPipelineAnalysis(projectPath, options.analysisId)
    : null;
  const intent = normalizeIntent(options.intent ?? analysis?.intent ?? '');
  const workflowPlan = planWorkflow(intent);
  const scopeVerdict = analysis?.scopeVerdict ?? inferScope(intent, 0);
  const executionMode = options.executionMode ?? defaultExecutionMode(scopeVerdict);
  const tddMode = options.tddMode ?? 'tdd';
  const reviewMode = options.reviewMode ?? defaultReviewMode(scopeVerdict);
  const id = idFor('PLN');
  const createdAt = timestampIso();
  const artifacts = {
    json: artifactPath(projectPath, 'plans', id, 'json'),
    markdown: artifactPath(projectPath, 'plans', id, 'md'),
  };
  const plan: PipelinePlan = {
    id,
    analysisId: analysis?.id ?? null,
    intent,
    taskType: analysis?.taskType ?? workflowPlan.taskType,
    scopeVerdict,
    executionMode,
    tddMode,
    reviewMode,
    createdAt,
    projectPath,
    tasks: planTasks({
      taskType: analysis?.taskType ?? workflowPlan.taskType,
      scopeVerdict,
      executionMode,
      tddMode,
      reviewMode,
    }),
    superpowers: baseSuperpowersBindings(
      analysis?.taskType ?? workflowPlan.taskType,
      executionMode,
      tddMode,
      reviewMode,
    ),
    next: {
      command: `zcw execute --from ${id}`,
      reason: 'the Superpowers-aware plan is ready to be converted into an execution checklist.',
    },
    artifacts,
  };

  return persistArtifact(plan, renderPlanMarkdown(plan));
}

async function createPipelineExecution(
  projectPath: string,
  options: CreatePipelineExecutionOptions,
): Promise<PipelineExecution> {
  const plan = await getPipelinePlan(projectPath, options.planId);
  const id = idFor('EXE');
  const createdAt = timestampIso();
  const artifacts = {
    json: artifactPath(projectPath, 'executions', id, 'json'),
    markdown: artifactPath(projectPath, 'executions', id, 'md'),
  };
  const execution: PipelineExecution = {
    id,
    planId: plan.id,
    intent: plan.intent,
    status: 'ready',
    createdAt,
    projectPath,
    steps: plan.tasks.map((task) => ({ ...task, status: 'pending' })),
    superpowers: plan.superpowers,
    next: {
      command: plan.tasks[0]?.command ?? 'zcw status',
      reason:
        'execution tracking is initialized; follow each step and load the listed Superpowers skills at the matching ZCW phase.',
    },
    artifacts,
  };

  return persistArtifact(execution, renderExecutionMarkdown(execution));
}

export {
  PIPELINE_ROOT_RELATIVE,
  createPipelineAnalysis,
  createPipelineExecution,
  createPipelinePlan,
  getPipelineAnalysis,
  getPipelinePlan,
};
export type {
  CreatePipelineAnalysisOptions,
  CreatePipelineExecutionOptions,
  CreatePipelinePlanOptions,
  ExecutionMode,
  PipelineAnalysis,
  PipelineExecution,
  PipelineKnowledgeContext,
  PipelineNextAction,
  PipelinePlan,
  PipelinePlanTask,
  PipelineScope,
  ReviewMode,
  SuperpowersBinding,
  TddMode,
};
