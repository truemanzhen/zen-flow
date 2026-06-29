import path from 'path';

import {
  addOverlay,
  applyOverlays,
  listOverlays,
  removeOverlay,
  type OverlayApplyResult,
  type OverlayEntry,
} from '../core/overlay.js';

interface OverlayCommandOptions {
  json?: boolean;
  content?: string;
}

function printOverlayEntries(entries: OverlayEntry[]): void {
  if (entries.length === 0) {
    console.log('No ZCW overlays found.');
    return;
  }

  for (const entry of entries) {
    console.log(`${entry.skill} ${entry.overlayPath}`);
  }
}

function printApplyResults(results: OverlayApplyResult[]): void {
  if (results.length === 0) {
    console.log('No ZCW overlays found.');
    return;
  }

  for (const result of results) {
    const changed = result.targets.filter((target) => target.status !== 'missing');
    console.log(`ZCW overlay applied: ${result.skill} (${changed.length} target(s))`);
    for (const target of result.targets.filter((item) => item.status !== 'missing')) {
      console.log(`  ${target.status}: ${target.path}`);
    }
  }
}

async function overlayAddCommand(
  skill: string,
  targetPath: string,
  options: OverlayCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  if (!options.content?.trim()) {
    throw new Error('Use --content to provide overlay instructions.');
  }

  const entry = await addOverlay(projectPath, skill, options.content);
  if (options.json) {
    console.log(JSON.stringify({ projectPath, entry }, null, 2));
    return;
  }

  console.log(`ZCW overlay saved: ${entry.overlayPath}`);
}

async function overlayListCommand(
  targetPath: string,
  options: OverlayCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const entries = await listOverlays(projectPath);

  if (options.json) {
    console.log(JSON.stringify({ projectPath, entries }, null, 2));
    return;
  }

  printOverlayEntries(entries);
}

async function overlayRemoveCommand(
  skill: string,
  targetPath: string,
  options: OverlayCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const entry = await removeOverlay(projectPath, skill);

  if (options.json) {
    console.log(JSON.stringify({ projectPath, entry }, null, 2));
    return;
  }

  console.log(entry.exists ? `ZCW overlay not found: ${skill}` : `ZCW overlay removed: ${skill}`);
}

async function overlayApplyCommand(
  skill: string | undefined,
  targetPath: string,
  options: OverlayCommandOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const results = await applyOverlays(projectPath, skill);

  if (options.json) {
    console.log(JSON.stringify({ projectPath, results }, null, 2));
    return;
  }

  printApplyResults(results);
}

export { overlayAddCommand, overlayApplyCommand, overlayListCommand, overlayRemoveCommand };
