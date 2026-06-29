import path from 'path';
import {
  getCodegraphStatus,
  initializeCodegraphProject,
  runCodegraphQuery,
  type CodegraphQueryMode,
} from '../core/codegraph.js';

interface GraphStatusOptions {
  json?: boolean;
}

interface GraphInitOptions {
  json?: boolean;
  install?: boolean;
  force?: boolean;
}

interface GraphQueryOptions {
  json?: boolean;
  limit?: number;
}

function parseLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid limit: ${String(value)}`);
  }
  return parsed;
}

function printStatus(status: ReturnType<typeof getCodegraphStatus>): void {
  console.log('[zcw graph]');
  console.log(`  CLI: ${status.cliInstalled ? status.command : '(not installed)'}`);
  console.log(`  Indexed: ${status.indexed ? 'yes' : 'no'}`);
  console.log(`  Index: ${status.indexPath}`);
  if (status.indexUpdatedAt) console.log(`  Updated: ${status.indexUpdatedAt}`);
  console.log(`  Entries: ${status.indexEntries.length}`);
  console.log(`  Next: ${status.next}`);
}

async function graphStatusCommand(
  targetPath: string,
  options: GraphStatusOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const status = getCodegraphStatus(projectPath);

  if (options.json) {
    console.log(JSON.stringify({ projectPath, status }, null, 2));
    return;
  }

  printStatus(status);
}

async function graphInitCommand(targetPath: string, options: GraphInitOptions = {}): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const result = await initializeCodegraphProject(projectPath, {
    installCli: options.install,
    force: options.force,
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, result }, null, 2));
    return;
  }

  console.log(`ZCW graph init ${result.status}: ${result.message}`);
  if (result.command) console.log(`  command: ${result.command}`);
}

async function graphQueryCommand(
  mode: CodegraphQueryMode,
  query: string,
  targetPath: string,
  options: GraphQueryOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const result = runCodegraphQuery(projectPath, {
    mode,
    query,
    limit: parseLimit(options.limit),
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, result }, null, 2));
    return;
  }

  console.log(result.output || '(no output)');
}

export { graphInitCommand, graphQueryCommand, graphStatusCommand };
