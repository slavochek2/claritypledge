/**
 * P1337 drift guard (founder, 2026-10-05): every statement list shows the newest version only.
 * Every `.from('points')` in the app source either goes through `currentVersionsOnly(...)` or is
 * marked `// versions: <reason>` directly above it (a single statement by id, a write, the
 * version chain, positions that stay with their version, the feed's own switch). A new query
 * with neither fails here. Members are DERIVED from the source tree, never listed by hand.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'tests' || name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const POINTS_TABLE = /\.from\(\s*['"`]points['"`]\s*\)/;

export function unguardedPointsQueries(files: { path: string; text: string }[]): string[] {
  const bad: string[] = [];
  for (const { path, text } of files) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!POINTS_TABLE.test(line) || /^\s*(\*|\/\/|\/\*)/.test(line)) return;
      const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
      if (/currentVersionsOnly\(/.test(context)) return;
      if (/\/\/\s*versions:\s*\S/.test(lines[i - 1] ?? '')) return;
      bad.push(`${path}:${i + 1}`);
    });
  }
  return bad;
}

const files = sourceFiles(ROOT).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, 'utf8') }));

describe('every points query reads current versions, or says why not', () => {
  it('finds the queries it is guarding (the scan is not blind)', () => {
    const hits = files.filter((f) => POINTS_TABLE.test(f.text)).map((f) => f.path);
    expect(hits).toContain('app/data/points-service-real.ts');
    expect(hits).toContain('app/data/compare-service.ts');
  });

  it('no unguarded query', () => {
    expect(unguardedPointsQueries(files)).toEqual([]);
  });

  it('flags a query with neither the helper nor a reason (control)', () => {
    const sample = "const q = await supabase\n  .from('points')\n  .select('id');";
    expect(unguardedPointsQueries([{ path: 'x.ts', text: sample }])).toEqual(['x.ts:2']);
    const marked = "const q = await supabase\n  // versions: all — one statement by id\n  .from('points')";
    expect(unguardedPointsQueries([{ path: 'x.ts', text: marked }])).toEqual([]);
    const empty = "const q = await supabase\n  // versions:\n  .from('points')";
    expect(unguardedPointsQueries([{ path: 'x.ts', text: empty }])).toEqual(['x.ts:3']);
  });
});

describe('every page read through the offline cache takes its late answer (P1337 item 2)', () => {
  it('each readThrough call passes onLate, or says why not with `// late:`', () => {
    const bad: string[] = [];
    const scanned = new Set<string>();
    for (const { path, text } of files) {
      if (path === 'lib/offline-read-cache.ts') continue;
      for (const m of text.matchAll(/\breadThrough\(/g)) {
        const start = m.index ?? 0;
        const lineStart = text.lastIndexOf('\n', start) + 1;
        if (/^\s*(import|\*|\/\/)/.test(text.slice(lineStart, start))) continue;
        // The call's own arguments, by bracket depth (fetchers are inline functions).
        let depth = 0;
        let end = start + 'readThrough'.length;
        for (; end < text.length; end++) {
          if (text[end] === '(') depth += 1;
          else if (text[end] === ')' && --depth === 0) break;
        }
        const call = text.slice(start, end + 1);
        scanned.add(path);
        const before = text.slice(0, lineStart).split('\n').slice(-3).join('\n');
        const line = text.slice(0, start).split('\n').length;
        if (/onLate\s*:/.test(call) || /\/\/\s*late:\s*\S/.test(before)) continue;
        bad.push(`${path}:${line}`);
      }
    }
    // Not blind: the scan reaches both the list pages and the event pages.
    expect(scanned).toContain('app/pages/stake-page.tsx');
    expect(scanned).toContain('app/prototypes/events/components/EventRoomAccess.tsx');
    expect(bad).toEqual([]);
  });
});
