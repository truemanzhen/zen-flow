import path from 'path';
import { promises as fs } from 'fs';
import { fileExists } from '../../utils/file-system.js';

export function resolveProjectPath(input: Record<string, unknown>): string {
  const raw = input.projectPath;
  return path.resolve(typeof raw === 'string' && raw.trim() ? raw : process.cwd());
}

export function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const raw = input[key];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

export async function artifactInfo(
  projectPath: string,
  relPath: string,
): Promise<{
  path: string;
  exists: boolean;
}> {
  const fullPath = path.join(projectPath, relPath);
  return {
    path: relPath,
    exists: await fileExists(fullPath),
  };
}

export async function readTextIfExists(filePath: string): Promise<string | null> {
  if (!(await fileExists(filePath))) return null;
  return fs.readFile(filePath, 'utf-8');
}
