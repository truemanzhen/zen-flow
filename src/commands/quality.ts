import path from 'path';
import { runAudit, runReview, runTests, type QualityResult } from '../core/quality.js';

interface QualityOptions {
  json?: boolean;
  script?: string;
}

function printQualityResult(result: QualityResult): void {
  console.log(`ZCW ${result.kind}: ${result.status}`);
  console.log(`  summary: ${result.summary}`);
  console.log(`  latest: ${result.artifacts.latest}`);
  console.log(`  run: ${result.artifacts.run}`);
  if (result.artifacts.session) console.log(`  session: ${result.artifacts.session}`);
  for (const check of result.checks) {
    console.log(`  ${check.status}: ${check.id} - ${check.message}`);
  }
}

async function auditCommand(targetPath: string, options: QualityOptions = {}): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const result = await runAudit(projectPath);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printQualityResult(result);
}

async function testCommand(targetPath: string, options: QualityOptions = {}): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const result = await runTests(projectPath, { script: options.script });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printQualityResult(result);
  if (result.status === 'fail') process.exitCode = 1;
}

async function reviewCommand(targetPath: string, options: QualityOptions = {}): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const result = await runReview(projectPath);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printQualityResult(result);
  if (result.status === 'fail') process.exitCode = 1;
}

export { auditCommand, printQualityResult, reviewCommand, testCommand };
