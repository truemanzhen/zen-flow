import { promises as fs } from 'fs';
import path from 'path';
import { fileExists, readJson, writeFile } from '../utils/file-system.js';
import type { QualityKind, QualityResult, QualityStatus } from './quality.js';

type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
type IssueStatus = 'open' | 'in_progress' | 'completed' | 'failed' | 'deferred';
type ActiveIssueStatus = Extract<IssueStatus, 'open' | 'in_progress'>;
type IssueSource = 'manual' | 'audit' | 'test' | 'review' | 'discovery';

interface IssueContext {
  location: string;
  suggested_fix: string;
  notes: string;
}

interface IssueHistoryEntry {
  timestamp: string;
  from_status: IssueStatus | null;
  to_status: IssueStatus;
  actor: string;
  note: string;
}

interface IssueFeedbackEntry {
  timestamp: string;
  type: string;
  content: string;
}

interface ZcwIssue {
  id: string;
  title: string;
  status: IssueStatus;
  priority: number;
  severity: IssueSeverity;
  source: IssueSource;
  milestone_ref: string | null;
  phase_ref: string | null;
  gap_ref: string | null;
  description: string;
  fix_direction: string;
  context: IssueContext;
  tags: string[];
  affected_components: string[];
  feedback: IssueFeedbackEntry[];
  issue_history: IssueHistoryEntry[];
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

interface IssueCreateInput {
  title: string;
  severity?: IssueSeverity;
  source?: IssueSource;
  priority?: number;
  phase?: string;
  milestone?: string;
  description?: string;
  tags?: string[];
  context?: Partial<IssueContext>;
  affectedComponents?: string[];
  fixDirection?: string;
}

interface IssueListFilters {
  status?: IssueStatus;
  severity?: IssueSeverity;
  source?: IssueSource;
  phase?: string;
  milestone?: string;
  tags?: string[];
  all?: boolean;
}

interface IssueUpdateInput {
  status?: ActiveIssueStatus;
  severity?: IssueSeverity;
  priority?: number;
  phase?: string;
  milestone?: string;
  description?: string;
  fixDirection?: string;
  tags?: string[];
  addTags?: string[];
  note?: string;
}

interface IssueCloseInput {
  status?: Extract<IssueStatus, 'completed' | 'failed' | 'deferred'>;
  resolution: string;
}

interface IssueDiscoveryResult {
  created: ZcwIssue[];
  existing: ZcwIssue[];
  scanned: string[];
}

const ISSUE_ROOT_RELATIVE = path.join('.zcw', 'issues');
const ACTIVE_FILE = 'issues.jsonl';
const HISTORY_FILE = 'issue-history.jsonl';

const severityOrder: Record<IssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const qualitySeverity: Record<QualityStatus, IssueSeverity> = {
  fail: 'high',
  warn: 'medium',
  pass: 'low',
};

function timestampIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

function dateForId(): string {
  return new Date().toISOString().replace(/\D/gu, '').slice(0, 8);
}

function issueRoot(projectPath: string): string {
  return path.join(projectPath, ISSUE_ROOT_RELATIVE);
}

function activeIssuesPath(projectPath: string): string {
  return path.join(issueRoot(projectPath), ACTIVE_FILE);
}

function historyIssuesPath(projectPath: string): string {
  return path.join(issueRoot(projectPath), HISTORY_FILE);
}

function assertChoice<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`Invalid ${label}: ${value}. Expected one of: ${allowed.join(', ')}`);
}

function normalizeSeverity(value = 'medium'): IssueSeverity {
  return assertChoice(value, ['critical', 'high', 'medium', 'low'], 'severity');
}

function normalizeActiveStatus(value = 'open'): ActiveIssueStatus {
  return assertChoice(value, ['open', 'in_progress'], 'status');
}

function normalizeFinalStatus(
  value = 'completed',
): Extract<IssueStatus, 'completed' | 'failed' | 'deferred'> {
  return assertChoice(value, ['completed', 'failed', 'deferred'], 'status');
}

function normalizeSource(value = 'manual'): IssueSource {
  return assertChoice(value, ['manual', 'audit', 'test', 'review', 'discovery'], 'source');
}

function normalizePriority(value = 3): number {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`Invalid priority: ${String(value)}. Expected an integer from 1 to 5.`);
  }
  return value;
}

function normalizeTags(tags: string[] = []): string[] {
  return Array.from(
    new Set(
      tags
        .flatMap((tag) => tag.split(','))
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort();
}

function normalizeList(values: string[] = []): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

async function ensureIssueStorage(projectPath: string): Promise<void> {
  for (const filePath of [activeIssuesPath(projectPath), historyIssuesPath(projectPath)]) {
    if (!(await fileExists(filePath))) {
      await writeFile(filePath, '');
    }
  }
}

async function readJsonl(filePath: string): Promise<ZcwIssue[]> {
  if (!(await fileExists(filePath))) return [];
  const content = await fs.readFile(filePath, 'utf-8');
  const issues: ZcwIssue[] = [];
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    issues.push(JSON.parse(trimmed) as ZcwIssue);
  }
  return issues;
}

async function writeJsonl(filePath: string, issues: ZcwIssue[]): Promise<void> {
  const content = issues.map((issue) => JSON.stringify(issue)).join('\n');
  await writeFile(filePath, content ? `${content}\n` : '');
}

async function readActiveIssues(projectPath: string): Promise<ZcwIssue[]> {
  await ensureIssueStorage(projectPath);
  return readJsonl(activeIssuesPath(projectPath));
}

async function readHistoryIssues(projectPath: string): Promise<ZcwIssue[]> {
  await ensureIssueStorage(projectPath);
  return readJsonl(historyIssuesPath(projectPath));
}

async function readAllIssues(projectPath: string): Promise<ZcwIssue[]> {
  const [active, history] = await Promise.all([
    readActiveIssues(projectPath),
    readHistoryIssues(projectPath),
  ]);
  return [...active, ...history];
}

async function nextIssueId(projectPath: string): Promise<string> {
  const today = dateForId();
  const prefix = `ISS-${today}-`;
  const issues = await readAllIssues(projectPath);
  const max = issues.reduce((highest, issue) => {
    if (!issue.id.startsWith(prefix)) return highest;
    const suffix = Number(issue.id.slice(prefix.length));
    return Number.isInteger(suffix) ? Math.max(highest, suffix) : highest;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function issueMatches(issue: ZcwIssue, filters: IssueListFilters): boolean {
  if (filters.status && issue.status !== filters.status) return false;
  if (filters.severity && issue.severity !== filters.severity) return false;
  if (filters.source && issue.source !== filters.source) return false;
  if (filters.phase && issue.phase_ref !== filters.phase) return false;
  if (filters.milestone && issue.milestone_ref !== filters.milestone) return false;

  const requiredTags = normalizeTags(filters.tags);
  if (requiredTags.length > 0 && !requiredTags.every((tag) => issue.tags.includes(tag))) {
    return false;
  }

  return true;
}

function sortIssues(a: ZcwIssue, b: ZcwIssue): number {
  return (
    a.priority - b.priority ||
    severityOrder[a.severity] - severityOrder[b.severity] ||
    b.updated_at.localeCompare(a.updated_at)
  );
}

async function createIssue(projectPath: string, input: IssueCreateInput): Promise<ZcwIssue> {
  const title = input.title.trim();
  if (!title) throw new Error('Issue title is required.');

  const now = timestampIso();
  const status: IssueStatus = 'open';
  const issue: ZcwIssue = {
    id: await nextIssueId(projectPath),
    title,
    status,
    priority: normalizePriority(input.priority),
    severity: normalizeSeverity(input.severity),
    source: normalizeSource(input.source),
    milestone_ref: input.milestone?.trim() || null,
    phase_ref: input.phase?.trim() || null,
    gap_ref: null,
    description: input.description?.trim() ?? '',
    fix_direction: input.fixDirection?.trim() ?? '',
    context: {
      location: input.context?.location?.trim() ?? '',
      suggested_fix: input.context?.suggested_fix?.trim() ?? '',
      notes: input.context?.notes?.trim() ?? '',
    },
    tags: normalizeTags(input.tags),
    affected_components: normalizeList(input.affectedComponents),
    feedback: [],
    issue_history: [
      {
        timestamp: now,
        from_status: null,
        to_status: status,
        actor: 'zcw',
        note: 'Issue created',
      },
    ],
    created_at: now,
    updated_at: now,
    resolved_at: null,
    resolution: null,
  };

  const issues = await readActiveIssues(projectPath);
  issues.push(issue);
  await writeJsonl(activeIssuesPath(projectPath), issues);
  return issue;
}

async function listIssues(
  projectPath: string,
  filters: IssueListFilters = {},
): Promise<ZcwIssue[]> {
  const issues = filters.all
    ? await readAllIssues(projectPath)
    : await readActiveIssues(projectPath);
  return issues.filter((issue) => issueMatches(issue, filters)).sort(sortIssues);
}

async function findIssue(projectPath: string, issueId: string): Promise<ZcwIssue | null> {
  const id = issueId.trim();
  if (!id) throw new Error('Issue ID is required.');
  const issues = await readAllIssues(projectPath);
  return issues.find((issue) => issue.id === id) ?? null;
}

async function updateIssue(
  projectPath: string,
  issueId: string,
  input: IssueUpdateInput,
): Promise<ZcwIssue> {
  const issues = await readActiveIssues(projectPath);
  const index = issues.findIndex((issue) => issue.id === issueId);
  if (index === -1) throw new Error(`Active issue not found: ${issueId}`);

  const issue = issues[index];
  const previousStatus = issue.status;
  if (input.status) issue.status = normalizeActiveStatus(input.status);
  if (input.severity) issue.severity = normalizeSeverity(input.severity);
  if (input.priority !== undefined) issue.priority = normalizePriority(input.priority);
  if (input.phase !== undefined) issue.phase_ref = input.phase.trim() || null;
  if (input.milestone !== undefined) issue.milestone_ref = input.milestone.trim() || null;
  if (input.description !== undefined) issue.description = input.description.trim();
  if (input.fixDirection !== undefined) issue.fix_direction = input.fixDirection.trim();
  if (input.tags) issue.tags = normalizeTags(input.tags);
  if (input.addTags) issue.tags = normalizeTags([...issue.tags, ...input.addTags]);

  const now = timestampIso();
  if (previousStatus !== issue.status) {
    issue.issue_history.push({
      timestamp: now,
      from_status: previousStatus,
      to_status: issue.status,
      actor: 'zcw',
      note: 'Status updated',
    });
  }
  if (input.note?.trim()) {
    issue.feedback.push({
      timestamp: now,
      type: 'clarification',
      content: input.note.trim(),
    });
  }

  issue.updated_at = now;
  issues[index] = issue;
  await writeJsonl(activeIssuesPath(projectPath), issues);
  return issue;
}

async function closeIssue(
  projectPath: string,
  issueId: string,
  input: IssueCloseInput,
): Promise<ZcwIssue> {
  const resolution = input.resolution.trim();
  if (!resolution) throw new Error('Issue resolution is required.');

  const active = await readActiveIssues(projectPath);
  const index = active.findIndex((issue) => issue.id === issueId);
  if (index === -1) throw new Error(`Active issue not found: ${issueId}`);

  const issue = active[index];
  const previousStatus = issue.status;
  const now = timestampIso();
  issue.status = normalizeFinalStatus(input.status);
  issue.resolved_at = now;
  issue.resolution = resolution;
  issue.updated_at = now;
  issue.issue_history.push({
    timestamp: now,
    from_status: previousStatus,
    to_status: issue.status,
    actor: 'zcw',
    note: 'Issue closed',
  });

  active.splice(index, 1);
  const history = await readHistoryIssues(projectPath);
  history.push(issue);
  await writeJsonl(activeIssuesPath(projectPath), active);
  await writeJsonl(historyIssuesPath(projectPath), history);
  return issue;
}

function qualityArtifactPath(projectPath: string, kind: QualityKind): string {
  return path.join(projectPath, '.zcw', 'quality', `${kind}-latest.json`);
}

function qualityCheckKey(kind: QualityKind, checkId: string, location = ''): string {
  return [kind, checkId, location].join('::');
}

function issueQualityKey(issue: ZcwIssue): string | null {
  if (!['audit', 'test', 'review'].includes(issue.source)) return null;
  const checkId = issue.context.notes.match(/^quality-check:([^\n]+)/u)?.[1];
  if (!checkId) return null;
  return qualityCheckKey(issue.source as QualityKind, checkId, issue.context.location);
}

function firstDetailLine(detail: string | undefined): string {
  return (
    detail
      ?.split(/\r?\n/u)
      .find((line) => line.trim())
      ?.trim() ?? ''
  );
}

async function discoverIssues(projectPath: string): Promise<IssueDiscoveryResult> {
  await ensureIssueStorage(projectPath);
  const active = await readActiveIssues(projectPath);
  const openKeys = new Map<string, ZcwIssue>();
  for (const issue of active) {
    if (issue.status === 'open' || issue.status === 'in_progress') {
      const key = issueQualityKey(issue);
      if (key) openKeys.set(key, issue);
    }
  }

  const created: ZcwIssue[] = [];
  const existing: ZcwIssue[] = [];
  const scanned: string[] = [];

  for (const kind of ['audit', 'test', 'review'] as const) {
    const artifact = qualityArtifactPath(projectPath, kind);
    if (!(await fileExists(artifact))) continue;
    scanned.push(artifact);

    const result = await readJson<QualityResult>(artifact);
    for (const check of result.checks) {
      if (check.status === 'pass') continue;

      const location = firstDetailLine(check.detail);
      const key = qualityCheckKey(kind, check.id, location);
      const duplicate = openKeys.get(key);
      if (duplicate) {
        existing.push(duplicate);
        continue;
      }

      const issue = await createIssue(projectPath, {
        title: `${kind}: ${check.id}`,
        severity: qualitySeverity[check.status],
        source: kind,
        priority: check.status === 'fail' ? 2 : 3,
        description: check.message,
        tags: ['quality', kind, check.status],
        context: {
          location,
          notes: `quality-check:${check.id}`,
        },
      });
      created.push(issue);
      openKeys.set(key, issue);
    }
  }

  return { created, existing, scanned };
}

export {
  ISSUE_ROOT_RELATIVE,
  activeIssuesPath,
  closeIssue,
  createIssue,
  discoverIssues,
  findIssue,
  historyIssuesPath,
  listIssues,
  updateIssue,
};
export type {
  IssueCloseInput,
  IssueContext,
  IssueCreateInput,
  IssueDiscoveryResult,
  IssueFeedbackEntry,
  IssueHistoryEntry,
  IssueListFilters,
  ActiveIssueStatus,
  IssueSeverity,
  IssueSource,
  IssueStatus,
  IssueUpdateInput,
  ZcwIssue,
};
