/**
 * P1532 (C6) — a pack cut short by hiding the tab must not start again from the top.
 *
 * P1522 made a hidden tab stop the pack and put the previous stamp back, so the pack is due again
 * on the next show. But the next run restarted at the first entry, and prefetchThrough always
 * calls its fetcher, so every entry stored before the hide was downloaded again. A user who
 * switches tabs during the pack paid for it once per switch, around the six-hour bound.
 *
 * Budget: five hide/show cycles mid-pack, then one run to completion, cost no more data reads
 * than one uninterrupted pack.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let reads = 0;
let hideAtRead = Number.POSITIVE_INFINITY;
const counted = <T,>(value: T) => async () => {
  reads += 1;
  if (reads === hideAtRead) setVisibility('hidden');
  return value;
};
vi.mock('@/app/data/offline-reads', () => ({
  stakeRead: (tag: string, viewer?: string) => ({ type: 'stake', id: `${tag}:${viewer ?? '-'}`, fetch: counted({ tag }) }),
  feedRead: (viewer?: string) => ({ type: 'feed', id: `${viewer ?? '-'}:desc:`, fetch: counted({ feed: 1 }) }),
  groupsRead: () => ({ type: 'groups', id: 'directory', fetch: counted({ groups: 1 }) }),
  homeRead: () => ({ type: 'home', id: 'highlights', fetch: counted({ groups: [], events: [] }) }),
}));
vi.mock('@/app/data/offline-reads-letters', () => ({
  letterCodeRead: (code: string) => ({ type: 'letter-code', id: code, fetch: counted(`L-${code}`) }),
  publicLetterRead: (id: string) => ({ type: 'letter', id, fetch: counted({ letter: { id } }) }),
}));
vi.mock('@/app/pages/stake-page', () => ({}));
vi.mock('@/app/pages/letter-reading-page', () => ({}));
vi.mock('@/app/pages/feed-page', () => ({}));
vi.mock('@/app/pages/org-directory-page', () => ({}));

import { MemoryEntryStore, _setOfflineEntryStoreForTesting } from '@/lib/offline-read-cache';
import { runOfflinePack } from '@/lib/offline-pack';
import { _resetNetworkOutcomeForTesting } from '@/lib/network-outcome';
import { STANDARD_LETTER_ENTRIES, STANDARD_STAKE_TAGS } from '@/app/data/event-links';

function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
}

/** Data reads in one uninterrupted pack: every stake, each letter's code + letter, feed, groups, home. */
const FULL_PACK_READS = STANDARD_STAKE_TAGS.length + STANDARD_LETTER_ENTRIES.length * 2 + 3;

beforeEach(() => {
  _setOfflineEntryStoreForTesting(new MemoryEntryStore());
  _resetNetworkOutcomeForTesting();
  localStorage.clear();
  reads = 0;
  hideAtRead = Number.POSITIVE_INFINITY;
  vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
  setVisibility('visible');
});
afterEach(() => setVisibility('visible'));

describe('P1532 offline pack resume', () => {
  it('one uninterrupted pack makes FULL_PACK_READS reads (the budget below is measured, not assumed)', async () => {
    const r = await runOfflinePack(undefined);
    expect(r.ran).toBe(true);
    expect(reads).toBe(FULL_PACK_READS);
  });

  it('five hide/show cycles mid-pack cost no more reads than one full pack', async () => {
    for (let cycle = 0; cycle < 5; cycle++) {
      hideAtRead = reads + 2; // the tab hides two reads into each run
      const r = await runOfflinePack(undefined);
      expect(r.ran, `cycle ${cycle} ran`).toBe(true);
      setVisibility('visible');
    }
    hideAtRead = Number.POSITIVE_INFINITY;
    await runOfflinePack(undefined);

    expect(reads, `reads across 5 interruptions + completion (one full pack is ${FULL_PACK_READS})`).toBeLessThanOrEqual(FULL_PACK_READS);
  });

  it('after the resumed pack completes, it is not due again (fresh stamp)', async () => {
    hideAtRead = 2;
    await runOfflinePack(undefined);
    setVisibility('visible');
    hideAtRead = Number.POSITIVE_INFINITY;
    await runOfflinePack(undefined);
    const before = reads;
    expect(await runOfflinePack(undefined)).toMatchObject({ ran: false, reason: 'fresh' });
    expect(reads).toBe(before);
  });
});
