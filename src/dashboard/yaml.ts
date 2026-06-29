/**
 * Lightweight `.zcw.yaml` parser.
 *
 * Mirrors the format produced by `assets/skills/zcw/scripts/zcw-state.sh`
 * (a single flat map of `key: value` lines). This is intentionally a subset
 * of YAML — no nested keys, no anchors — and matches the parser already used
 * by `src/commands/status.ts`. It is reproduced here, rather than reused, to
 * keep the dashboard module standalone; a future PR may consolidate them.
 */

import { promises as fs } from 'fs';
import { fileExists } from '../utils/file-system.js';

export type ZCWYaml = Record<string, string>;

export async function readZCWYaml(yamlPath: string): Promise<ZCWYaml | null> {
  if (!(await fileExists(yamlPath))) return null;
  const raw = await fs.readFile(yamlPath, 'utf-8');
  return parseZCWYaml(raw);
}

export function parseZCWYaml(raw: string): ZCWYaml {
  const out: ZCWYaml = {};
  for (const line of raw.split(/\r?\n/u)) {
    const stripped = stripInlineComment(line);
    const match = stripped.match(/^(\w[\w_]*):\s*(.*)$/u);
    if (!match) continue;
    const value = match[2].trim();
    out[match[1]] = stripWrappingQuotes(value);
  }
  return out;
}

function stripInlineComment(line: string): string {
  // Walk char-by-char so that `#` inside quoted strings is preserved.
  let out = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (!quote) {
      if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '#' && (i === 0 || /\s/u.test(line[i - 1]))) {
        return out.replace(/\s+$/u, '');
      }
    } else if (ch === quote) {
      quote = null;
    }
    out += ch;
  }
  return out;
}

function stripWrappingQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' || first === "'") && first === last) {
    return value.slice(1, -1);
  }
  return value;
}
