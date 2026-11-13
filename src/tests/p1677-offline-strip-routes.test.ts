/**
 * P1677 — the known-route set must cover every top-level `path` in src/App.tsx, so a new
 * top-level route cannot silently become `other`. Dev-only /tree routes live in tree-routes.tsx
 * and are not in App.tsx.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { USE_CASE_LANDINGS } from '@/app/routes/use-case-landings';
import { resolve } from 'node:path';
import {
  KNOWN_TOP_LEVEL_SEGMENTS,
  reduceRoute,
  stripStateFromText,
} from '@/app/components/offline/offline-strip-episodes';
import { STRIP_OFFLINE_TEXT, STRIP_SLOW_TEXT, stripCachedText } from '@/app/contexts/offline-status-context';

function firstSegment(path: string): string {
  return path === '*' ? '' : (path.split('/')[1] ?? '');
}

/** First segments of every `path="..."` in the given source files. */
function segmentsFromFiles(files: string[]): Set<string> {
  const segments = new Set<string>();
  for (const file of files) {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    for (const match of source.matchAll(/path="([^"]*)"/g)) {
      const segment = firstSegment(match[1] ?? '');
      if (segment !== '') segments.add(segment);
    }
  }
  return segments;
}

const ROUTES_DIR = 'src/app/routes';
const routeFiles = readdirSync(resolve(process.cwd(), ROUTES_DIR))
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => `${ROUTES_DIR}/${f}`);

describe('P1677 known top-level routes', () => {
  it('equals the first path segments in src/App.tsx, src/app/routes/*.tsx and USE_CASE_LANDINGS', () => {
    const fromApp = segmentsFromFiles(['src/App.tsx']);
    const fromRouteFiles = segmentsFromFiles(routeFiles);
    const fromLandings = new Set(USE_CASE_LANDINGS.map((l) => firstSegment(l.path)));
    // An empty or broken parse of any one source must not pass.
    expect(fromApp.has('story')).toBe(true);
    expect(fromApp.size).toBeGreaterThan(30);
    expect(fromRouteFiles.has('partner-template')).toBe(true);
    expect(fromLandings.has('hospitals')).toBe(true);
    const derived = new Set([...fromApp, ...fromRouteFiles, ...fromLandings]);
    expect([...derived].sort()).toEqual([...KNOWN_TOP_LEVEL_SEGMENTS].sort());
  });

  it('reduceRoute never returns more than a known segment', () => {
    expect(reduceRoute('/story/3f2b8c1e-9a4d-4e6b-8f10-2c7d5a9e1b34')).toBe('/story');
    expect(reduceRoute('/')).toBe('/');
    expect(reduceRoute('')).toBe('/');
    expect(reduceRoute('/k9Zx3Qm2Lp7Rt5Vw1Yb8')).toBe('other');
    expect(reduceRoute('/tree/demo')).toBe('other');
  });

  it('maps strip text to state without looking at the age part', () => {
    expect(stripStateFromText(STRIP_SLOW_TEXT)).toBe('slow');
    expect(stripStateFromText(STRIP_OFFLINE_TEXT)).toBe('offline');
    expect(stripStateFromText(stripCachedText('just now'))).toBe('offline_cached');
    expect(stripStateFromText(stripCachedText('5 min ago'))).toBe('offline_cached');
    expect(stripStateFromText(stripCachedText('3 days ago'))).toBe('offline_cached');
    expect(stripStateFromText(null)).toBeNull();
  });
});
