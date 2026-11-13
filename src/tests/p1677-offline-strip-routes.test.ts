/**
 * P1677 — the known-route set must cover every top-level `path` in src/App.tsx, so a new
 * top-level route cannot silently become `other`. Dev-only /tree routes live in tree-routes.tsx
 * and are not in App.tsx.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  KNOWN_TOP_LEVEL_SEGMENTS,
  reduceRoute,
  stripStateFromText,
} from '@/app/components/offline/offline-strip-episodes';
import { STRIP_OFFLINE_TEXT, STRIP_SLOW_TEXT, stripCachedText } from '@/app/contexts/offline-status-context';

function appTopLevelSegments(): Set<string> {
  const source = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  const segments = new Set<string>();
  for (const match of source.matchAll(/path="([^"]*)"/g)) {
    const path = match[1] ?? '';
    if (path === '*') continue;
    const segment = path.split('/')[1] ?? '';
    if (segment !== '') segments.add(segment);
  }
  return segments;
}

describe('P1677 known top-level routes', () => {
  it('equals the set of first path segments in src/App.tsx', () => {
    const derived = appTopLevelSegments();
    // An empty or broken parse must not pass.
    expect(derived.has('story')).toBe(true);
    expect(derived.size).toBeGreaterThan(30);
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
