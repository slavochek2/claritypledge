/**
 * @file p1515-canvas-link-token-head-script.test.tsx
 * @description P1515: the FIRST script in index.html's <head> takes a canvas link token (`#k=`, or the older `?k=`)
 * out of the address before any SDK loads (Mixpanel's first pageview, Sentry.init and its Replay buffer, CSP reports,
 * history). It stores the token in sessionStorage under the key the canvas page reads, and replaces the address
 * without it.
 *   - the script is run VERBATIM from index.html against a fake window (every shape of address) and against the real
 *     jsdom window followed by the real CanvasPage (the chain: address clean, storage holds it, the page reads with it);
 *   - the script's key format and canvas-link-token.ts's storageKey agree;
 *   - it sits before every other script, in particular before the Mixpanel snippet.
 * Each "does nothing" assertion has a control showing the same script doing its job.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PointWithUserPosition } from '@/app/types';
import { clearLinkTokens, linkTokenStorageKey, readLinkToken } from '@/lib/canvas-link-token';

const getCanvas = vi.hoisted(() => vi.fn());
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'reader-1' } }, user: { id: 'reader-1' }, sessionChecked: true }) }));
vi.mock('@/app/data/api', () => ({
  getProfileBySlugResult: vi.fn(async () => ({ success: true, data: { id: 'owner-1', name: 'Ana', avatarUrl: null, avatarColor: '#3b82f6', hasPledged: false } })),
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { getCanvas, getAudience: vi.fn(async () => []), setPosition: vi.fn() } }));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getCanvasProjectTags: vi.fn(async () => ['sales']) } }));
vi.mock('@/app/data/calibration-service', () => ({ calibrationService: { getEarsCount: vi.fn(async () => 0) } }));
vi.mock('@/app/contexts/agent-accounts-context', () => ({ useAgentAccountIds: () => ({ isAgentAccountId: () => false, isLoading: false }) }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/pages/not-found-page', () => ({ NotFoundPage: () => <div data-testid="canvas-not-found" /> }));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: () => null }));
vi.mock('@/app/components/social/point-positions-block', () => ({ PointPositionsBlock: () => null }));
vi.mock('@/app/components/letters/letter-position-story-dialog', () => ({ LetterPositionStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-add-story-dialog', () => ({ CanvasAddStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => null }));

import { CanvasPage } from '@/app/pages/canvas-page';

const TOKEN = '3f9a0c7be214d85e6a1b9c0d4e7f2a58'; // gitleaks:allow — synthetic link-token fixture, matches no real token
const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
const HEAD = html.match(/<!-- P1515-HEAD-BEGIN[\s\S]*?<script>([\s\S]*?)<\/script>\s*<!-- P1515-HEAD-END -->/);
if (!HEAD) throw new Error('P1515 head script missing from index.html');
const SCRIPT = HEAD[1]!;

/** Runs the head script against a fake window: returns what it stored, what the address became, and the flag. */
function runFake(pathname: string, search = '', hash = '', throwOnSet = false) {
  const stored: Record<string, string> = {};
  const replaced: string[] = [];
  const win = {
    location: { pathname, search, hash },
    history: { state: { idx: 0 }, replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url); } },
    sessionStorage: { setItem: (k: string, v: string) => { if (throwOnSet) throw new Error('blocked'); stored[k] = v; } },
    __canvasLinkTokenLoad: undefined as boolean | undefined,
    __canvasLinkTokenFallback: undefined as Record<string, string> | undefined,
    __canvasLinkTokenLoadKeys: undefined as string[] | undefined,
  };
  new Function('window', SCRIPT)(win);
  return { stored, replaced, flag: win.__canvasLinkTokenLoad, memory: win.__canvasLinkTokenFallback, loadKeys: win.__canvasLinkTokenLoadKeys };
}

const point = {
  id: 'p1', statement: 'Point one', tags: [], systemTags: ['canvas:problem'], visibility: 'private', userPosition: null,
  totalPositions: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
} as unknown as PointWithUserPosition;

beforeEach(() => { sessionStorage.clear(); clearLinkTokens(); getCanvas.mockReset(); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('the head script, verbatim, against every shape of address', () => {
  it('takes #k= out of the address, keeps other fragment and query parameters, stores the token, sets the flag', () => {
    const r = runFake('/p/ana/canvas/sales', '?point=abc', `#with=u1&k=${TOKEN}`);
    expect(r.replaced).toEqual(['/p/ana/canvas/sales?point=abc#with=u1']);
    expect(r.stored).toEqual({ 'canvas-link:ana/sales': TOKEN });
    expect(r.flag).toBe(true);
    expect(r.replaced.join()).not.toContain(TOKEN);
    expect(r.loadKeys).toEqual(['canvas-link:ana/sales']); // the key THIS load wrote: a boot-time SIGNED_OUT keeps it
  });

  it('still takes the older ?k= (links copied before the fragment form)', () => {
    const r = runFake('/p/ana/canvas/sales', `?k=${TOKEN}&point=abc`);
    expect(r.replaced).toEqual(['/p/ana/canvas/sales?point=abc']);
    expect(r.stored['canvas-link:ana/sales']).toBe(TOKEN);
    expect(r.flag).toBe(true);
  });

  it('a percent-encoded parameter name (%6B) is the same k', () => {
    const r = runFake('/p/ana/canvas/sales', `?%6B=${TOKEN}`);
    expect(r.replaced).toEqual(['/p/ana/canvas/sales']);
    expect(r.stored['canvas-link:ana/sales']).toBe(TOKEN);
  });

  it('the key matches canvas-link-token.ts for every handle and name shape (case, percent-encoding)', () => {
    for (const [path, handle, name] of [
      ['/p/ana/canvas/sales', 'ana', 'sales'],
      ['/p/Ana/canvas/Sales', 'Ana', 'Sales'],
      ['/p/ana-smith/canvas/q4_plan', 'ana-smith', 'q4_plan'],
      ['/p/%C3%A4na/canvas/sales/', 'äna', 'sales'],
    ] as const) {
      const r = runFake(path, '', `#k=${TOKEN}`);
      expect(Object.keys(r.stored), path).toEqual([linkTokenStorageKey(handle, name)]);
    }
  });

  it('does nothing on a canvas address with no token, or on other pages (CONTROLS)', () => {
    for (const [path, search, hash] of [
      ['/p/ana/canvas/sales', '', ''],
      ['/p/ana/canvas/sales', '?point=abc', '#with=u1'],
      ['/p/ana', '', `#k=${TOKEN}`], // not a canvas address
      ['/events/x', `?k=${TOKEN}`, ''],
      ['/', '', ''],
    ] as const) {
      const r = runFake(path, search, hash);
      expect(r.replaced, `${path}${search}${hash}`).toEqual([]);
      expect(r.stored).toEqual({});
      expect(r.flag).toBeUndefined();
    }
  });

  it('an undecodable path never leaves the token in the address: the address is stripped FIRST, the token is dropped (nothing stored)', () => {
    const bad = runFake('/p/%E0%A4%A/canvas/sales', '?point=abc', `#k=${TOKEN}`);
    expect(bad.replaced).toEqual(['/p/%E0%A4%A/canvas/sales?point=abc']);
    expect(bad.replaced.join()).not.toContain(TOKEN);
    expect(bad.stored).toEqual({});
    expect(bad.memory).toBeUndefined();
    expect(bad.loadKeys).toBeUndefined(); // nothing was kept, so nothing is protected
    expect(bad.flag).toBe(true); // the load carried a token: recording stays off
    // CONTROL: the same script keeps a decodable address's token
    expect(runFake('/p/ana/canvas/sales', '', `#k=${TOKEN}`).stored['canvas-link:ana/sales']).toBe(TOKEN);
  });

  it('blocked storage (setItem throws): the address is still stripped and the token is kept in memory; CONTROL: storage ok keeps both', () => {
    const blocked = runFake('/p/ana/canvas/sales', '', `#k=${TOKEN}`, true);
    expect(blocked.replaced).toEqual(['/p/ana/canvas/sales']);
    expect(blocked.stored).toEqual({});
    expect(blocked.memory).toEqual({ 'canvas-link:ana/sales': TOKEN });
    expect(blocked.flag).toBe(true);
    const ok = runFake('/p/ana/canvas/sales', '', `#k=${TOKEN}`);
    expect(ok.stored).toEqual({ 'canvas-link:ana/sales': TOKEN });
    expect(ok.memory).toEqual({ 'canvas-link:ana/sales': TOKEN });
  });

  it('does not store or flag when there is no token, but is the same script that does (control for the previous cases)', () => {
    expect(runFake('/p/ana/canvas/sales', '', '').flag).toBeUndefined();
    expect(runFake('/p/ana/canvas/sales', '', `#k=${TOKEN}`).flag).toBe(true);
  });
});

describe('placement in index.html', () => {
  it('is the first script of <head>: before the Mixpanel snippet, the JSON-LD and everything else that could record a URL', () => {
    const begin = html.indexOf('P1515-HEAD-BEGIN');
    expect(begin).toBeGreaterThan(html.indexOf('<head>'));
    const firstScript = html.indexOf('<script');
    expect(html.indexOf('<script', begin)).toBe(firstScript);
    expect(begin).toBeLessThan(html.indexOf('mixpanel'));
    expect(begin).toBeLessThan(html.indexOf('application/ld+json'));
    expect(begin).toBeLessThan(html.indexOf('/src/main.tsx'));
    expect(html.indexOf('mixpanel.init(')).toBeGreaterThan(begin);
    expect(html).toContain('window.__canvasLinkTokenLoad === true'); // the recording-off rule reads the flag
  });
});

describe('the chain in a real window: the address after the head script has no token, storage holds it, the page reads with it', () => {
  it('#k= form', async () => {
    getCanvas.mockResolvedValue({
      points: [point], stories: new Map(), addedStoryIds: [], positions: new Map(), visibility: 'shared', isOwner: false, admitted: true,
      generalAccess: 'link', canvasExists: false, via: null,
    });
    window.history.replaceState(null, '', `/p/ana/canvas/sales#k=${TOKEN}`);
    new Function(SCRIPT)(); // the head script, in the real jsdom window, before the app starts
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
    expect(readLinkToken('ana', 'sales')).toBe(TOKEN);
    render(
      <BrowserRouter>
        <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
      </BrowserRouter>,
    );
    await screen.findByTestId('canvas-shared-link');
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', TOKEN);
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('CONTROL: without the head script the page strips an arriving fragment itself (an in-app arrival) and still reads with the token', async () => {
    getCanvas.mockResolvedValue({
      points: [point], stories: new Map(), addedStoryIds: [], positions: new Map(), visibility: 'shared', isOwner: false, admitted: true,
      generalAccess: 'link', canvasExists: false, via: null,
    });
    window.history.replaceState(null, '', `/p/ana/canvas/sales#k=${TOKEN}`);
    render(
      <BrowserRouter>
        <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
      </BrowserRouter>,
    );
    await screen.findByTestId('canvas-shared-link');
    await waitFor(() => expect(window.location.hash).toBe(''));
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', TOKEN);
    expect(window.location.href).not.toContain(TOKEN);
  });
});

describe('blocked sessionStorage, in a real window: the link survives through memory (head script verbatim, then the page)', () => {
  it('setItem throws: address stripped, token in memory, the page reads with it; clearing the stored tokens (what every session end does) empties the memory too', async () => {
    getCanvas.mockResolvedValue({
      points: [point], stories: new Map(), addedStoryIds: [], positions: new Map(), visibility: 'shared', isOwner: false, admitted: true,
      generalAccess: 'link', canvasExists: false, via: null,
    });
    // jsdom's Storage cannot be spied on; replace the property with a store that refuses every read and write (blocked / full)
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    const refusing = {
      setItem: () => { throw new Error('QuotaExceededError'); },
      getItem: () => { throw new Error('SecurityError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    };
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => refusing });
    try {
      window.history.replaceState(null, '', `/p/ana/canvas/sales#k=${TOKEN}`);
      new Function(SCRIPT)();
      expect(window.location.href).not.toContain(TOKEN);
      expect(window.location.hash).toBe('');
      expect(readLinkToken('ana', 'sales')).toBe(TOKEN); // storage cannot be read: the in-memory copy answers
      render(
        <BrowserRouter>
          <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
        </BrowserRouter>,
      );
      await screen.findByTestId('canvas-shared-link');
      expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', TOKEN);
      clearLinkTokens(); // what every session end does
      expect(readLinkToken('ana', 'sales')).toBeUndefined();
    } finally {
      if (original) Object.defineProperty(window, 'sessionStorage', original);
      else delete (window as unknown as { sessionStorage?: unknown }).sessionStorage;
    }
  });

  it('CONTROL: with working storage the same address is read from storage, and clearing removes both copies', () => {
    window.history.replaceState(null, '', `/p/ana/canvas/sales#k=${TOKEN}`);
    new Function(SCRIPT)();
    expect(sessionStorage.getItem('canvas-link:ana/sales')).toBe(TOKEN);
    expect(readLinkToken('ana', 'sales')).toBe(TOKEN);
    clearLinkTokens();
    expect(sessionStorage.getItem('canvas-link:ana/sales')).toBeNull();
    expect(readLinkToken('ana', 'sales')).toBeUndefined();
    expect((window as unknown as { __canvasLinkTokenFallback?: Record<string, string> }).__canvasLinkTokenFallback).toEqual({});
  });
});

