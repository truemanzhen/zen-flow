import path from 'path';
import {
  createPipelineAnalysis,
  createPipelineExecution,
  createPipelinePlan,
  type ExecutionMode,
  type PipelineAnalysis,
  type PipelineExecution,
  type PipelinePlan,
  type ReviewMode,
  type TddMode,
} from '../core/pipeline.js';

interface AnalyzeOptions {
  json?: boolean;
  code?: boolean;
}

interface PlanOptions {
  json?: boolean;
  from?: string;
  intent?: string;
  executionMode?: ExecutionMode;
  tddMode?: TddMode;
  reviewMode?: ReviewMode;
}

interface ExecuteOptions {
  json?: boolean;
  from?: string;
}

function printAnalysis(analysis: PipelineAnalysis): void {
  console.log(`ZCW analysis created: ${analysis.id}`);
  console.log(`  scope: ${analysis.scopeVerdict}`);
  console.log(`  task type: ${analysis.taskType}`);
  console.log(`  markdown: ${analysis.artifacts.markdown}`);
  console.log(`  next: ${analysis.next.command}`);
}

function printPlan(plan: PipelinePlan): void {
  console.log(`ZCW plan created: ${plan.id}`);
  console.log(`  execution: ${plan.executionMode}`);
  console.log(`  tdd: ${plan.tddMode}`);
  console.log(`  review: ${plan.reviewMode}`);
  console.log(`  markdown: ${plan.artifacts.markdown}`);
  console.log(`  next: ${plan.next.command}`);
}

function printExecution(execution: PipelineExecution): void {
  console.log(`ZCW execution created: ${execution.id}`);
  console.log(`  plan: ${execution.planId}`);
  console.log(`  markdown: ${execution.artifacts.markdown}`);
  console.log(`  next: ${execution.next.command}`);
}

async function analyzeCommand(
  intent: string,
  targetPath: string,
  options: AnalyzeOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const analysis = await createPipelineAnalysis(projectPath, intent, {
    code: options.code,
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, analysis }, null, 2));
    return;
  }

  printAnalysis(analysis);
}

async function planCommand(targetPath: string, options: PlanOptions = {}): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const plan = await createPipelinePlan(projectPath, {
    analysisId: options.from,
    intent: options.intent,
    executionMode: options.executionMode,
    tddMode: options.tddMode,
    reviewMode: options.reviewMode,
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, plan }, null, 2));
    return;
  }

  printPlan(plan);
}

async function executeCommand(targetPath: string, options: ExecuteOptions = {}): Promise<void> {
  const projectPath = path.resolve(targetPath);
  if (!options.from?.trim()) {
    throw new Error('Use --from <plan-id> to create execution tracking.');
  }

  const execution = await createPipelineExecution(projectPath, { planId: options.from });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, execution }, null, 2));
    return;
  }

  printExecution(execution);
}

export { analyzeCommand, executeCommand, planCommand };
