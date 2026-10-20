/**
 * P1522 — the offline pack was ~60% of a fresh browser's Supabase requests (measured with
 * scripts/measure-idle-requests.mjs: /feed 70 requests with the pack, 27 without). Every e2e
 * context and every headless crawler is a fresh browser, so it ran on each one. These pin the two
 * cuts: no pack under browser automation unless a test opts in, and no pack work in a hidden tab.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let onLetterCode: (() => void) | null = null;
vi.mock('@/app/data/offline-reads', () => ({
  stakeRead: (tag: string, viewer?: string) => ({ type: 'stake', id: `${tag}:${viewer ?? '-'}`, fetch: async () => ({ tag }) }),
  feedRead: (viewer?: string) => ({ type: 'feed', id: `${viewer ?? '-'}:desc:`, fetch: async () => ({ feed: 1 }) }),
  groupsRead: () => ({ type: 'groups', id: 'directory', fetch: async () => ({ groups: 1 }) }),
  homeRead: () => ({ type: 'home', id: 'highlights', fetch: async () => ({ groups: [], events: [] }) }),
}));
vi.mock('@/app/data/offline-reads-letters', () => ({
  letterCodeRead: (code: string) => ({
    type: 'letter-code',
    id: code,
    fetch: async () => {
      onLetterCode?.();
      return `L-${code}`;
    },
  }),
  publicLetterRead: (id: string) => ({ type: 'letter', id, fetch: async () => ({ letter: { id } }) }),
}));
vi.mock('@/app/pages/stake-page', () => ({}));
vi.mock('@/app/pages/letter-reading-page', () => ({}));
vi.mock('@/app/pages/feed-page', () => ({}));
vi.mock('@/app/pages/org-directory-page', () => ({}));

import { MemoryEntryStore, _setOfflineEntryStoreForTesting } from '@/lib/offline-read-cache';
import { OFFLINE_PACK_ALLOW_AUTOMATION_KEY, runOfflinePack } from '@/lib/offline-pack';
import { _resetNetworkOutcomeForTesting } from '@/lib/network-outcome';
import { STANDARD_LETTER_ENTRIES, STANDARD_STAKE_TAGS } from '@/app/data/event-links';

const setVisibility = (v: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
const setWebdriver = (v: boolean) => Object.defineProperty(navigator, 'webdriver', { value: v, configurable: true });

beforeEach(() => {
  _setOfflineEntryStoreForTesting(new MemoryEntryStore());
  _resetNetworkOutcomeForTesting();
  localStorage.clear();
  onLetterCode = null;
  vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
  setVisibility('visible');
  setWebdriver(false);
});
afterEach(() => {
  setVisibility('visible');
  setWebdriver(false);
});

describe('P1522 offline pack egress', () => {
  it('does not run under browser automation (e2e contexts, headless crawlers)', async () => {
    setWebdriver(true);
    expect(await runOfflinePack(undefined)).toEqual({ ran: false, reason: 'automation', attempted: 0, stored: 0, files: 0 });
  });

  it('runs under automation when a test opts in', async () => {
    setWebdriver(true);
    localStorage.setItem(OFFLINE_PACK_ALLOW_AUTOMATION_KEY, '1');
    expect((await runOfflinePack(undefined)).ran).toBe(true);
  });

  it('stops issuing reads once the tab is hidden mid-run', async () => {
    const full = STANDARD_STAKE_TAGS.length + STANDARD_LETTER_ENTRIES.length * 2 + 3;
    onLetterCode = () => setVisibility('hidden');
    const r = await runOfflinePack(undefined);
    expect(r.ran).toBe(true);
    // The read in flight when the tab hid completes; nothing after it starts.
    expect(r.attempted).toBeLessThan(full);
    expect(r.attempted).toBeLessThanOrEqual(STANDARD_STAKE_TAGS.length + 1);
  });

  it('a run cut short by hiding is due again once visible (no fresh stamp left behind)', async () => {
    onLetterCode = () => setVisibility('hidden');
    await runOfflinePack(undefined);
    onLetterCode = null;
    setVisibility('visible');
    expect((await runOfflinePack(undefined)).ran).toBe(true);
  });

  it('stops before the second static file when the tab hides during the first', async () => {
    const fetchMock = vi.fn(async () => {
      setVisibility('hidden');
      return new Response('ok', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await runOfflinePack(undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is not due when the tab is hidden at start', async () => {
    setVisibility('hidden');
    expect(await runOfflinePack(undefined)).toMatchObject({ ran: false, reason: 'hidden' });
  });
});
