/**
 * @file p1515-sentry-replay-guard.test.ts
 * @description P1515: Sentry Replay (replaysOnErrorSampleRate 1.0 buffers a page from load and uploads the buffer on
 * any error) must not start on a canvas load that carries its link token: the buffer's first URL is the one with
 * `?k=<token>`. The decision is made before Sentry.init.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shouldStartReplay } from '@/lib/sentry-replay-guard';

const TOKEN = '3f9a0c7be214d85e6a1b9c0d4e7f2a58'; // gitleaks:allow — synthetic link-token fixture, matches no real token

describe('shouldStartReplay', () => {
  it('is false on a canvas address that carries the token, whatever else is in the query', () => {
    expect(shouldStartReplay('/p/ana/canvas/sales', `?k=${TOKEN}`)).toBe(false);
    expect(shouldStartReplay('/p/ana/canvas/sales', `?point=abc&k=${TOKEN}`)).toBe(false);
    expect(shouldStartReplay('/p/ana/canvas/sales/', `?k=${TOKEN}`)).toBe(false);
  });

  it('is false when the token is in the fragment, or the head script reports it already took one out of this load', () => {
    expect(shouldStartReplay('/p/ana/canvas/sales', '', `#k=${TOKEN}`)).toBe(false);
    expect(shouldStartReplay('/p/ana/canvas/sales', '', `#a=1&k=${TOKEN}`)).toBe(false);
    expect(shouldStartReplay('/p/ana/canvas/sales', `?%6B=${TOKEN}`)).toBe(false); // a percent-encoded name is still k
    expect(shouldStartReplay('/p/ana/canvas/sales', '', '', true)).toBe(false); // the address was already cleaned: the flag remembers
  });

  it('CONTROLS: every other load still records (token-free canvas, other pages, other params that contain a k)', () => {
    expect(shouldStartReplay('/p/ana/canvas/sales', '')).toBe(true);
    expect(shouldStartReplay('/p/ana/canvas/sales', '?point=abc')).toBe(true);
    expect(shouldStartReplay('/p/ana', `?k=${TOKEN}`)).toBe(true);
    expect(shouldStartReplay('/events/x', '?kind=talk&key=abc&k2=1')).toBe(true);
    expect(shouldStartReplay('/', '')).toBe(true);
    expect(shouldStartReplay('/p/ana/canvas/sales', '', '#point=abc')).toBe(true);
    expect(shouldStartReplay('/p/ana', '', `#k=${TOKEN}`)).toBe(true);
    expect(shouldStartReplay('/p/ana/canvas/sales', '', '', false)).toBe(true);
  });
});

describe('main.tsx adds the Replay integration only through that decision, before Sentry.init runs', () => {
  const src = readFileSync(join(__dirname, '../main.tsx'), 'utf8');

  it('the replay integration is behind shouldStartReplay(location)', () => {
    expect(src).toMatch(/shouldStartReplay\(window\.location\.pathname, window\.location\.search, window\.location\.hash,[\s\S]*?__canvasLinkTokenLoad[\s\S]*?\)\s*\?\s*\[Sentry\.replayIntegration\(/);
    // no unconditional replayIntegration anywhere else
    expect([...src.matchAll(/Sentry\.replayIntegration\(/g)]).toHaveLength(1);
    expect(src.indexOf('shouldStartReplay(')).toBeGreaterThan(src.indexOf('Sentry.init({'));
    expect(src).toMatch(/replaysOnErrorSampleRate:\s*1\.0/); // the sample rate is unchanged: the integration is what is withheld
  });
});
