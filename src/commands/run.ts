import path from 'path';
import { createWorkflowSession, formatPlan, planWorkflow } from '../core/session.js';

interface RunOptions {
  dryRun?: boolean;
  json?: boolean;
  code?: boolean;
  knowledge?: boolean;
}

export async function runCommand(
  intent: string,
  targetPath: string,
  options: RunOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const plan = planWorkflow(intent);

  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ dryRun: true, projectPath, ...plan }, null, 2));
      return;
    }
    console.log(formatPlan(plan));
    return;
  }

  const session = await createWorkflowSession(projectPath, intent, {
    knowledge: options.knowledge,
    code: options.code,
  });
  const firstStep = session.steps[0] ?? null;

  if (options.json) {
    console.log(JSON.stringify({ projectPath, session, nextStep: firstStep }, null, 2));
    return;
  }

  console.log('ZCW session created.');
  console.log(`  session: ${session.sessionId}`);
  console.log(`  chain: ${session.chainName}`);
  console.log(`  state: ${session.sessionPath}`);
  if (session.knowledgeContext.skipped) {
    console.log('  knowledge: skipped');
  } else {
    const codeState = session.knowledgeContext.codegraph ? ', codegraph loaded' : '';
    console.log(
      `  knowledge: ${session.knowledgeContext.entries.length} entries loaded${codeState}`,
    );
    for (const warning of session.knowledgeContext.warnings) {
      console.log(`  warning: ${warning}`);
    }
  }
  if (firstStep) {
    console.log(`  next: ${firstStep.command}`);
    console.log(`  step: ${firstStep.description}`);
  }
}
