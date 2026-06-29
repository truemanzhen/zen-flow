import path from 'path';
import { formatSessionNext, getNextWorkflowStep } from '../core/session.js';

interface ContinueOptions {
  json?: boolean;
}

export async function continueCommand(
  targetPath: string,
  options: ContinueOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const next = await getNextWorkflowStep(projectPath);

  if (!next) {
    if (options.json) {
      console.log(JSON.stringify({ projectPath, session: null, nextStep: null }, null, 2));
      return;
    }
    console.log('No ZCW session found.');
    console.log('Start one with: zcw run "your intent"');
    return;
  }

  if (options.json) {
    console.log(
      JSON.stringify({ projectPath, session: next.session, nextStep: next.step }, null, 2),
    );
    return;
  }

  console.log(formatSessionNext(next));
}
