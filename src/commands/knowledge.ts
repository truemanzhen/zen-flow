import path from 'path';
import {
  addKnowledgeEntry,
  harvestSpecKnowledge,
  linkWikiEntries,
  listKnowledgeEntries,
  loadKnowledgeContext,
  searchKnowledgeEntries,
  type KnowledgeEntry,
  type KnowledgeKind,
  type KnowledgeSearchResult,
} from '../core/knowledge.js';
import { runCodegraphQuery, type CodegraphQueryResult } from '../core/codegraph.js';

interface KnowledgeCommandOptions {
  json?: boolean;
  content?: string;
  definition?: string;
  tag?: string[];
  source?: string;
  limit?: number;
}

interface WikiLinkOptions {
  json?: boolean;
  relation?: string;
}

interface HarvestOptions {
  json?: boolean;
}

interface LoadOptions {
  json?: boolean;
  intent?: string;
  query?: string;
  code?: boolean;
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

function printEntries(entries: KnowledgeEntry[]): void {
  if (entries.length === 0) {
    console.log('No ZCW knowledge entries found.');
    return;
  }

  for (const entry of entries) {
    const tags = entry.tags.length ? ` [${entry.tags.join(', ')}]` : '';
    console.log(`${entry.id} ${entry.title}${tags}`);
  }
}

function printSearchResults(results: KnowledgeSearchResult[]): void {
  if (results.length === 0) {
    console.log('No matching ZCW knowledge entries found.');
    return;
  }

  for (const result of results) {
    const tags = result.entry.tags.length ? ` [${result.entry.tags.join(', ')}]` : '';
    console.log(`${result.entry.id} ${result.entry.title}${tags}`);
    if (result.entry.content) {
      console.log(`  ${result.entry.content.replace(/\s+/gu, ' ').slice(0, 160)}`);
    }
  }
}

async function addCommand(
  kind: KnowledgeKind,
  title: string,
  targetPath: string,
  options: KnowledgeCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const entry = await addKnowledgeEntry(projectPath, {
    kind,
    title,
    content: options.content,
    tags: options.tag,
    source: options.source,
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, entry }, null, 2));
    return;
  }

  console.log(`ZCW ${kind} entry added: ${entry.id}`);
}

async function listCommand(
  kind: KnowledgeKind,
  targetPath: string,
  options: KnowledgeCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const entries = await listKnowledgeEntries(projectPath, {
    kind,
    tags: options.tag,
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, entries }, null, 2));
    return;
  }

  printEntries(entries);
}

async function searchCommand(
  kind: KnowledgeKind,
  query: string,
  targetPath: string,
  options: KnowledgeCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const results = await searchKnowledgeEntries(projectPath, {
    kind,
    query,
    tags: options.tag,
    limit: parseLimit(options.limit),
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, results }, null, 2));
    return;
  }

  printSearchResults(results);
}

async function wikiLinkCommand(
  from: string,
  to: string,
  targetPath: string,
  options: WikiLinkOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const entry = await linkWikiEntries(projectPath, from, to, options.relation);

  if (options.json) {
    console.log(JSON.stringify({ projectPath, entry }, null, 2));
    return;
  }

  console.log(`ZCW wiki link added: ${entry.id} -> ${to}`);
}

function glossaryTags(tags: string[] = []): string[] {
  return ['domain', 'glossary', ...tags];
}

async function glossaryAddCommand(
  term: string,
  targetPath: string,
  options: KnowledgeCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const entry = await addKnowledgeEntry(projectPath, {
    kind: 'wiki',
    title: term,
    content: options.definition ?? options.content,
    tags: glossaryTags(options.tag),
    source: options.source ?? 'zcw glossary',
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, entry }, null, 2));
    return;
  }

  console.log(`ZCW glossary term added: ${entry.id}`);
}

async function glossaryListCommand(
  targetPath: string,
  options: KnowledgeCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const entries = await listKnowledgeEntries(projectPath, {
    kind: 'wiki',
    tags: glossaryTags(options.tag),
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, entries }, null, 2));
    return;
  }

  printEntries(entries);
}

async function glossarySearchCommand(
  query: string,
  targetPath: string,
  options: KnowledgeCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const results = await searchKnowledgeEntries(projectPath, {
    kind: 'wiki',
    query,
    tags: glossaryTags(options.tag),
    limit: parseLimit(options.limit),
  });

  if (options.json) {
    console.log(JSON.stringify({ projectPath, results }, null, 2));
    return;
  }

  printSearchResults(results);
}

async function harvestCommand(
  specPath: string,
  targetPath: string,
  options: HarvestOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const result = await harvestSpecKnowledge(projectPath, specPath);

  if (options.json) {
    console.log(JSON.stringify({ projectPath, ...result }, null, 2));
    return;
  }

  console.log(`ZCW knowledge harvested: ${result.entry.id}`);
  console.log(`  source: ${result.entry.sourceSpec}`);
  console.log(`  files: ${result.files.join(', ')}`);
}

async function loadCommand(targetPath: string, options: LoadOptions = {}): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const query = options.query ?? options.intent ?? '';
  if (!query.trim()) {
    throw new Error('Use --intent or --query to load relevant knowledge.');
  }

  const results = await loadKnowledgeContext(projectPath, query, parseLimit(options.limit));
  let codegraph: CodegraphQueryResult | null = null;
  if (options.code) {
    codegraph = runCodegraphQuery(projectPath, {
      mode: 'search',
      query,
      limit: parseLimit(options.limit),
    });
  }

  if (options.json) {
    console.log(JSON.stringify({ projectPath, query, results, codegraph }, null, 2));
    return;
  }

  console.log(`ZCW knowledge context for: ${query}`);
  printSearchResults(results);
  if (codegraph) {
    console.log('');
    console.log('CodeGraph:');
    console.log(codegraph.output || '(no output)');
  }
}

export {
  addCommand,
  glossaryAddCommand,
  glossaryListCommand,
  glossarySearchCommand,
  harvestCommand,
  listCommand,
  loadCommand,
  searchCommand,
  wikiLinkCommand,
};
