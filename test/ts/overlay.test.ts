import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  addOverlay,
  applyOverlays,
  listOverlays,
  removeOverlay,
} from '../../src/core/overlay.js';
import {
  overlayAddCommand,
  overlayApplyCommand,
  overlayListCommand,
  overlayRemoveCommand,
} from '../../src/commands/overlay.js';

describe('ZCW project overlays', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `zcw-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeClaudeSkill(content = '# Build\n'): Promise<string> {
    const skillPath = path.join(tmpDir, '.claude', 'skills', 'zcw-build', 'SKILL.md');
    await fs.mkdir(path.dirname(skillPath), { recursive: true });
    await fs.writeFile(skillPath, content, 'utf-8');
    return skillPath;
  }

  it('stores and lists project overlays', async () => {
    const entry = await addOverlay(tmpDir, 'zcw-build', 'Prefer local acceptance checks.');
    const overlays = await listOverlays(tmpDir);

    expect(entry.overlayPath).toBe(path.join(tmpDir, '.zcw', 'overlays', 'zcw-build.md'));
    expect(overlays).toEqual([
      expect.objectContaining({
        skill: 'zcw-build',
        exists: true,
      }),
    ]);
  });

  it('applies overlays idempotently to installed skills', async () => {
    const skillPath = await writeClaudeSkill();
    await addOverlay(tmpDir, 'zcw-build', 'Prefer local acceptance checks.');

    const first = await applyOverlays(tmpDir, 'zcw-build');
    const firstContent = await fs.readFile(skillPath, 'utf-8');
    const second = await applyOverlays(tmpDir, 'zcw-build');
    const secondContent = await fs.readFile(skillPath, 'utf-8');

    expect(first[0].targets).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: skillPath, status: 'applied' })]),
    );
    expect(second[0].targets).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: skillPath, status: 'updated' })]),
    );
    expect(secondContent).toBe(firstContent);
    expect(secondContent.match(/zcw:overlay:start zcw-build/gu)).toHaveLength(1);
    expect(secondContent).toContain('Prefer local acceptance checks.');
  });

  it('updates an existing overlay block when content changes', async () => {
    const skillPath = await writeClaudeSkill();
    await addOverlay(tmpDir, 'zcw-build', 'First instruction.');
    await applyOverlays(tmpDir, 'zcw-build');
    await addOverlay(tmpDir, 'zcw-build', 'Second instruction.');
    await applyOverlays(tmpDir, 'zcw-build');

    const content = await fs.readFile(skillPath, 'utf-8');
    expect(content).toContain('Second instruction.');
    expect(content).not.toContain('First instruction.');
    expect(content.match(/zcw:overlay:start zcw-build/gu)).toHaveLength(1);
  });

  it('rejects non-zcw skill names', async () => {
    await expect(addOverlay(tmpDir, 'comet-build', 'Nope.')).rejects.toThrow(
      /Invalid overlay skill/u,
    );
  });

  it('removes overlay files', async () => {
    await addOverlay(tmpDir, 'zcw-build', 'Temporary instruction.');
    const entry = await removeOverlay(tmpDir, 'zcw-build');

    expect(entry.exists).toBe(false);
    await expect(fs.access(path.join(tmpDir, '.zcw', 'overlays', 'zcw-build.md'))).rejects.toThrow();
  });

  it('prints JSON from overlay commands', async () => {
    await writeClaudeSkill();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let listJson = '';
    let applyJson = '';
    try {
      await overlayAddCommand('zcw-build', tmpDir, {
        content: 'Command overlay.',
        json: true,
      });
      await overlayListCommand(tmpDir, { json: true });
      listJson = log.mock.calls.at(-1)?.join(' ') ?? '';
      await overlayApplyCommand('zcw-build', tmpDir, { json: true });
      applyJson = log.mock.calls.at(-1)?.join(' ') ?? '';
      await overlayRemoveCommand('zcw-build', tmpDir, { json: true });
    } finally {
      log.mockRestore();
    }

    expect(JSON.parse(listJson).entries[0].skill).toBe('zcw-build');
    expect(JSON.parse(applyJson).results[0].targets).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'applied' })]),
    );
  });
});
