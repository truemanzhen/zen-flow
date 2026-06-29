import path from 'path';
import { promises as fs } from 'fs';
import { fileExists, readDir, readJson, writeFile } from '../utils/file-system.js';

type KnowledgeKind = 'kn' | 'wiki';

interface KnowledgeLink {
  target: string;
  relation: string;
}

interface KnowledgeEntry {
  id: string;
  kind: KnowledgeKind;
  title: string;
  content: string;
  tags: string[];
  links: KnowledgeLink[];
  source?: string;
  sourceSpec?: string;
  createdAt: string;
  updatedAt: string;
}

interface AddKnowledgeInput {
  kind: KnowledgeKind;
  title: string;
  content?: string;
  tags?: string[];
  source?: string;
  sourceSpec?: string;
}

interface SearchKnowledgeOptions {
  kind?: KnowledgeKind;
  query?: string;
  tags?: string[];
  limit?: number;
}

interface KnowledgeSearchResult {
  entry: KnowledgeEntry;
  score: number;
  matched: string[];
}

interface HarvestResult {
  entry: KnowledgeEntry;
  files: string[];
}

const KNOWLEDGE_ROOT_RELATIVE = path.join('.zcw', 'knowledge');
const DEFAULT_LIMIT = 10;

function timestampIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

function timestampForId(): string {
  return new Date().toISOString().replace(/\D/gu, '').slice(0, 14);
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
  return slug || 'entry';
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

function knowledgeRoot(projectPath: string): string {
  return path.join(projectPath, KNOWLEDGE_ROOT_RELATIVE);
}

function kindDir(projectPath: string, kind: KnowledgeKind): string {
  return path.join(knowledgeRoot(projectPath), kind);
}

function entryPath(projectPath: string, kind: KnowledgeKind, id: string): string {
  return path.join(kindDir(projectPath, kind), `${id}.json`);
}

function parseQuery(query = ''): string[] {
  return query
    .toLowerCase()
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function readEntries(projectPath: string, kind?: KnowledgeKind): Promise<KnowledgeEntry[]> {
  const kinds: KnowledgeKind[] = kind ? [kind] : ['kn', 'wiki'];
  const entries: KnowledgeEntry[] = [];

  for (const itemKind of kinds) {
    const dir = kindDir(projectPath, itemKind);
    const files = await readDir(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(dir, file);
      try {
        entries.push(await readJson<KnowledgeEntry>(filePath));
      } catch {
        // Ignore malformed entries; doctor can later report storage health.
      }
    }
  }

  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function findEntry(projectPath: string, idOrTitle: string): Promise<KnowledgeEntry | null> {
  const needle = idOrTitle.trim().toLowerCase();
  const entries = await readEntries(projectPath);
  return (
    entries.find((entry) => entry.id.toLowerCase() === needle) ??
    entries.find((entry) => entry.title.toLowerCase() === needle) ??
    null
  );
}

async function addKnowledgeEntry(
  projectPath: string,
  input: AddKnowledgeInput,
): Promise<KnowledgeEntry> {
  const title = input.title.trim();
  if (!title) throw new Error('Knowledge title is required.');

  const now = timestampIso();
  const id = `${input.kind}-${timestampForId()}-${Math.random().toString(36).slice(2, 6)}-${slugify(title)}`;
  const entry: KnowledgeEntry = {
    id,
    kind: input.kind,
    title,
    content: input.content?.trim() ?? '',
    tags: normalizeTags(input.tags),
    links: [],
    source: input.source?.trim() || undefined,
    sourceSpec: input.sourceSpec?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await writeFile(entryPath(projectPath, input.kind, id), JSON.stringify(entry, null, 2) + '\n');
  return entry;
}

async function listKnowledgeEntries(
  projectPath: string,
  options: SearchKnowledgeOptions = {},
): Promise<KnowledgeEntry[]> {
  const requiredTags = normalizeTags(options.tags);
  const entries = await readEntries(projectPath, options.kind);
  if (requiredTags.length === 0) return entries;

  return entries.filter((entry) => requiredTags.every((tag) => entry.tags.includes(tag)));
}

function scoreEntry(
  entry: KnowledgeEntry,
  terms: string[],
  requiredTags: string[],
): KnowledgeSearchResult {
  const haystack = [
    entry.id,
    entry.title,
    entry.content,
    entry.source ?? '',
    entry.sourceSpec ?? '',
    entry.tags.join(' '),
  ]
    .join('\n')
    .toLowerCase();

  if (!requiredTags.every((tag) => entry.tags.includes(tag))) {
    return { entry, score: 0, matched: [] };
  }

  if (terms.length === 0) {
    return { entry, score: 1, matched: [] };
  }

  const matched = terms.filter((term) => haystack.includes(term));
  let score = matched.length;
  for (const term of matched) {
    if (entry.title.toLowerCase().includes(term)) score += 2;
    if (entry.tags.some((tag) => tag.includes(term))) score += 1;
  }

  return { entry, score, matched };
}

async function searchKnowledgeEntries(
  projectPath: string,
  options: SearchKnowledgeOptions = {},
): Promise<KnowledgeSearchResult[]> {
  const terms = parseQuery(options.query);
  const requiredTags = normalizeTags(options.tags);
  const entries = await readEntries(projectPath, options.kind);
  const limit = options.limit && options.limit > 0 ? options.limit : DEFAULT_LIMIT;

  return entries
    .map((entry) => scoreEntry(entry, terms, requiredTags))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.updatedAt.localeCompare(a.entry.updatedAt))
    .slice(0, limit);
}

async function linkWikiEntries(
  projectPath: string,
  from: string,
  to: string,
  relation = 'related',
): Promise<KnowledgeEntry> {
  const fromEntry = await findEntry(projectPath, from);
  if (!fromEntry || fromEntry.kind !== 'wiki') {
    throw new Error(`Wiki entry not found: ${from}`);
  }

  const toEntry = await findEntry(projectPath, to);
  if (!toEntry || toEntry.kind !== 'wiki') {
    throw new Error(`Wiki entry not found: ${to}`);
  }

  const cleanRelation = relation.trim() || 'related';
  const exists = fromEntry.links.some(
    (link) => link.target === toEntry.id && link.relation === cleanRelation,
  );

  if (!exists) {
    fromEntry.links.push({ target: toEntry.id, relation: cleanRelation });
    fromEntry.links.sort((a, b) => a.target.localeCompare(b.target));
    fromEntry.updatedAt = timestampIso();
    await writeFile(
      entryPath(projectPath, fromEntry.kind, fromEntry.id),
      JSON.stringify(fromEntry, null, 2) + '\n',
    );
  }

  return fromEntry;
}

async function readIfExists(filePath: string): Promise<string | null> {
  if (!(await fileExists(filePath))) return null;
  return fs.readFile(filePath, 'utf-8');
}

function firstHeading(content: string): string | null {
  const heading = content.split(/\r?\n/u).find((line) => /^#\s+/.test(line));
  return heading ? heading.replace(/^#\s+/u, '').trim() : null;
}

async function harvestSpecKnowledge(projectPath: string, specPath: string): Promise<HarvestResult> {
  const resolvedSpecPath = path.resolve(projectPath, specPath);
  const rawRelativeSpecPath = path.relative(projectPath, resolvedSpecPath);
  if (
    rawRelativeSpecPath === '' ||
    rawRelativeSpecPath.startsWith('..') ||
    path.isAbsolute(rawRelativeSpecPath)
  ) {
    throw new Error('Spec path must stay inside the project.');
  }
  const relativeSpecPath = rawRelativeSpecPath.replace(/\\/gu, '/');

  const stat = await fs.stat(resolvedSpecPath);
  if (!stat.isDirectory()) {
    throw new Error(`Spec path must be a directory: ${specPath}`);
  }

  const candidates = ['spec.md', 'plan.md', 'tasks.md', '.zcw.yaml'];
  const parts: string[] = [];
  const files: string[] = [];
  let title = `Harvest: ${path.basename(resolvedSpecPath)}`;

  for (const file of candidates) {
    const fullPath = path.join(resolvedSpecPath, file);
    const content = await readIfExists(fullPath);
    if (content === null) continue;

    const rel = path.relative(projectPath, fullPath).replace(/\\/gu, '/');
    files.push(rel);
    const heading = firstHeading(content);
    if (file === 'spec.md' && heading) title = `Harvest: ${heading}`;

    const excerpt = content.trim().slice(0, 1200);
    parts.push(`## ${rel}\n${excerpt}`);
  }

  if (parts.length === 0) {
    throw new Error(`No Spec Kit artifacts found in ${specPath}.`);
  }

  const entry = await addKnowledgeEntry(projectPath, {
    kind: 'kn',
    title,
    content: parts.join('\n\n'),
    tags: ['harvest', 'spec-kit', path.basename(resolvedSpecPath)],
    source: 'zcw harvest',
    sourceSpec: relativeSpecPath,
  });

  return { entry, files };
}

async function loadKnowledgeContext(
  projectPath: string,
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<KnowledgeSearchResult[]> {
  return searchKnowledgeEntries(projectPath, { query, limit });
}

export {
  KNOWLEDGE_ROOT_RELATIVE,
  addKnowledgeEntry,
  harvestSpecKnowledge,
  linkWikiEntries,
  listKnowledgeEntries,
  loadKnowledgeContext,
  searchKnowledgeEntries,
};
export type {
  AddKnowledgeInput,
  HarvestResult,
  KnowledgeEntry,
  KnowledgeKind,
  KnowledgeLink,
  KnowledgeSearchResult,
  SearchKnowledgeOptions,
};
