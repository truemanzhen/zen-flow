import path from 'path';
import { promises as fs } from 'fs';

import { ensureDir, fileExists, removeFile, writeFile } from '../utils/file-system.js';
import { getPlatformSkillsDir, PLATFORMS } from './platforms.js';

const OVERLAY_ROOT_RELATIVE = path.join('.zcw', 'overlays');

type OverlayTargetStatus = 'applied' | 'updated' | 'missing';

interface OverlayEntry {
  skill: string;
  overlayPath: string;
  exists: boolean;
}

interface OverlayApplyTarget {
  path: string;
  status: OverlayTargetStatus;
}

interface OverlayApplyResult {
  skill: string;
  overlayPath: string;
  targets: OverlayApplyTarget[];
}

function validateOverlaySkill(skill: string): void {
  if (skill !== 'zcw' && !/^zcw-[a-z0-9-]+$/u.test(skill)) {
    throw new Error(`Invalid overlay skill "${skill}". Use "zcw" or a zcw-* skill name.`);
  }
}

function getOverlayPath(projectPath: string, skill: string): string {
  validateOverlaySkill(skill);
  return path.join(projectPath, OVERLAY_ROOT_RELATIVE, `${skill}.md`);
}

function overlayMarkers(skill: string): { start: string; end: string } {
  return {
    start: `<!-- zcw:overlay:start ${skill} -->`,
    end: `<!-- zcw:overlay:end ${skill} -->`,
  };
}

function renderOverlayBlock(skill: string, content: string): string {
  const markers = overlayMarkers(skill);
  return [markers.start, '## Project Overlay', '', content.trim(), markers.end, ''].join('\n');
}

function applyOverlayBlock(
  existing: string,
  skill: string,
  overlayContent: string,
): {
  content: string;
  status: Extract<OverlayTargetStatus, 'applied' | 'updated'>;
} {
  const block = renderOverlayBlock(skill, overlayContent);
  const markers = overlayMarkers(skill);
  const start = existing.indexOf(markers.start);
  const end = existing.indexOf(markers.end);

  if (start !== -1 && end !== -1 && end > start) {
    const afterEnd = end + markers.end.length;
    const next = `${existing.slice(0, start).replace(/\s*$/u, '')}\n\n${block}${existing
      .slice(afterEnd)
      .replace(/^\s*/u, '')}`;
    return { content: next.replace(/\s*$/u, '\n'), status: 'updated' };
  }

  const separator = existing.trim().length > 0 ? '\n\n' : '';
  return {
    content: `${existing.replace(/\s*$/u, '')}${separator}${block}`,
    status: 'applied',
  };
}

function getSkillTargetPaths(projectPath: string, skill: string): string[] {
  const seen = new Set<string>();
  const targets: string[] = [];

  for (const platform of PLATFORMS) {
    for (const candidate of [
      path.join(
        projectPath,
        getPlatformSkillsDir(platform, 'project'),
        'skills',
        skill,
        'SKILL.md',
      ),
      path.join(projectPath, getPlatformSkillsDir(platform, 'project'), skill, 'SKILL.md'),
    ]) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      targets.push(candidate);
    }
  }

  return targets;
}

async function addOverlay(
  projectPath: string,
  skill: string,
  content: string,
): Promise<OverlayEntry> {
  const overlayPath = getOverlayPath(projectPath, skill);
  await writeFile(overlayPath, `${content.trim()}\n`);
  return { skill, overlayPath, exists: true };
}

async function listOverlays(projectPath: string): Promise<OverlayEntry[]> {
  const root = path.join(projectPath, OVERLAY_ROOT_RELATIVE);
  if (!(await fileExists(root))) return [];

  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => {
      const skill = entry.name.replace(/\.md$/u, '');
      validateOverlaySkill(skill);
      return {
        skill,
        overlayPath: path.join(root, entry.name),
        exists: true,
      };
    })
    .sort((a, b) => a.skill.localeCompare(b.skill));
}

async function removeOverlay(projectPath: string, skill: string): Promise<OverlayEntry> {
  const overlayPath = getOverlayPath(projectPath, skill);
  const existed = await fileExists(overlayPath);
  if (existed) {
    await removeFile(overlayPath);
  }
  return { skill, overlayPath, exists: false };
}

async function applyOverlay(projectPath: string, skill: string): Promise<OverlayApplyResult> {
  const overlayPath = getOverlayPath(projectPath, skill);
  if (!(await fileExists(overlayPath))) {
    throw new Error(`Overlay not found for ${skill}: ${overlayPath}`);
  }

  const overlayContent = await fs.readFile(overlayPath, 'utf-8');
  const targets: OverlayApplyTarget[] = [];

  for (const targetPath of getSkillTargetPaths(projectPath, skill)) {
    if (!(await fileExists(targetPath))) {
      targets.push({ path: targetPath, status: 'missing' });
      continue;
    }

    const existing = await fs.readFile(targetPath, 'utf-8');
    const applied = applyOverlayBlock(existing, skill, overlayContent);
    await ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, applied.content, 'utf-8');
    targets.push({ path: targetPath, status: applied.status });
  }

  return { skill, overlayPath, targets };
}

async function applyOverlays(projectPath: string, skill?: string): Promise<OverlayApplyResult[]> {
  if (skill) {
    return [await applyOverlay(projectPath, skill)];
  }

  const overlays = await listOverlays(projectPath);
  const results: OverlayApplyResult[] = [];
  for (const overlay of overlays) {
    results.push(await applyOverlay(projectPath, overlay.skill));
  }
  return results;
}

export {
  OVERLAY_ROOT_RELATIVE,
  addOverlay,
  applyOverlays,
  getOverlayPath,
  listOverlays,
  removeOverlay,
  validateOverlaySkill,
};
export type { OverlayApplyResult, OverlayApplyTarget, OverlayEntry, OverlayTargetStatus };
