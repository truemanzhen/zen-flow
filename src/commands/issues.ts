import path from 'path';
import {
  closeIssue,
  createIssue,
  discoverIssues,
  findIssue,
  listIssues,
  updateIssue,
  type IssueSeverity,
  type IssueSource,
  type IssueStatus,
  type ActiveIssueStatus,
  type ZcwIssue,
} from '../core/issues.js';

interface IssueCommandOptions {
  json?: boolean;
  title?: string;
  severity?: IssueSeverity;
  source?: IssueSource;
  priority?: string | number;
  phase?: string;
  milestone?: string;
  description?: string;
  fixDirection?: string;
  tag?: string[];
  addTag?: string[];
  status?: IssueStatus;
  all?: boolean;
  note?: string;
  resolution?: string;
}

function parsePriority(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new Error(`Invalid priority: ${String(value)}. Expected an integer from 1 to 5.`);
  }
  return parsed;
}

function parseActiveStatus(value: IssueStatus | undefined): ActiveIssueStatus | undefined {
  if (value === undefined || value === 'open' || value === 'in_progress') return value;
  throw new Error(`Invalid active issue status: ${value}. Use issue close for final statuses.`);
}

function printIssueLine(issue: ZcwIssue): void {
  console.log(
    `${issue.id} | ${issue.status.padEnd(11)} | ${issue.severity.padEnd(8)} | P${issue.priority} | ${issue.title}`,
  );
}

function printIssueTable(issues: ZcwIssue[]): void {
  if (issues.length === 0) {
    console.log('No ZCW issues found.');
    return;
  }

  console.log(`ZCW issues (${issues.length})`);
  console.log('ID           | Status      | Severity | Pri | Title');
  for (const issue of issues) {
    printIssueLine(issue);
  }
}

function printIssueDetail(issue: ZcwIssue): void {
  console.log(`${issue.id}: ${issue.title}`);
  console.log(`  status: ${issue.status}`);
  console.log(`  severity: ${issue.severity}`);
  console.log(`  priority: ${issue.priority}`);
  console.log(`  source: ${issue.source}`);
  if (issue.phase_ref) console.log(`  phase: ${issue.phase_ref}`);
  if (issue.milestone_ref) console.log(`  milestone: ${issue.milestone_ref}`);
  if (issue.description) console.log(`  description: ${issue.description}`);
  if (issue.fix_direction) console.log(`  fix_direction: ${issue.fix_direction}`);
  if (issue.context.location) console.log(`  location: ${issue.context.location}`);
  if (issue.tags.length) console.log(`  tags: ${issue.tags.join(', ')}`);
  if (issue.resolution) console.log(`  resolution: ${issue.resolution}`);
  console.log(`  created_at: ${issue.created_at}`);
  console.log(`  updated_at: ${issue.updated_at}`);
}

async function issueCreateCommand(
  targetPath: string,
  options: IssueCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  if (!options.title?.trim()) {
    throw new Error('Use --title to create an issue.');
  }

  const issue = await createIssue(projectPath, {
    title: options.title,
    severity: options.severity,
    source: options.source,
    priority: parsePriority(options.priority),
    phase: options.phase,
    milestone: options.milestone,
    description: options.description,
    fixDirection: options.fixDirection,
    tags: options.tag,
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, issue }, null, 2));
    return;
  }

  console.log(`ZCW issue created: ${issue.id}`);
  console.log(`  ${issue.title}`);
}

async function issueListCommand(
  targetPath: string,
  options: IssueCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const issues = await listIssues(projectPath, {
    status: options.status,
    severity: options.severity,
    source: options.source,
    phase: options.phase,
    milestone: options.milestone,
    tags: options.tag,
    all: options.all,
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, issues }, null, 2));
    return;
  }

  printIssueTable(issues);
}

async function issueStatusCommand(
  issueId: string,
  targetPath: string,
  options: IssueCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const issue = await findIssue(projectPath, issueId);
  if (!issue) throw new Error(`Issue not found: ${issueId}`);

  if (options.json) {
    console.log(JSON.stringify({ projectPath, issue }, null, 2));
    return;
  }

  printIssueDetail(issue);
}

async function issueUpdateCommand(
  issueId: string,
  targetPath: string,
  options: IssueCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const issue = await updateIssue(projectPath, issueId, {
    status: parseActiveStatus(options.status),
    severity: options.severity,
    priority: parsePriority(options.priority),
    phase: options.phase,
    milestone: options.milestone,
    description: options.description,
    fixDirection: options.fixDirection,
    tags: options.tag,
    addTags: options.addTag,
    note: options.note,
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, issue }, null, 2));
    return;
  }

  console.log(`ZCW issue updated: ${issue.id}`);
  console.log(`  status: ${issue.status}`);
}

async function issueCloseCommand(
  issueId: string,
  targetPath: string,
  options: IssueCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  if (!options.resolution?.trim()) {
    throw new Error('Use --resolution to close an issue.');
  }

  const issue = await closeIssue(projectPath, issueId, {
    status: options.status as 'completed' | 'failed' | 'deferred' | undefined,
    resolution: options.resolution,
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, issue }, null, 2));
    return;
  }

  console.log(`ZCW issue closed: ${issue.id}`);
  console.log(`  status: ${issue.status}`);
  console.log(`  resolution: ${issue.resolution}`);
}

async function issueDiscoverCommand(
  targetPath: string,
  options: IssueCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const result = await discoverIssues(projectPath);

  if (options.json) {
    console.log(JSON.stringify({ projectPath, ...result }, null, 2));
    return;
  }

  console.log(
    `ZCW issue discovery: ${result.created.length} created, ${result.existing.length} existing`,
  );
  if (result.scanned.length) {
    console.log(`  scanned: ${result.scanned.join(', ')}`);
  }
  for (const issue of result.created) {
    console.log(`  created: ${issue.id} ${issue.title}`);
  }
}

export {
  issueCloseCommand,
  issueCreateCommand,
  issueDiscoverCommand,
  issueListCommand,
  issueStatusCommand,
  issueUpdateCommand,
};
