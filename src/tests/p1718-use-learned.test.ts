/**
 * P1718 review round 8 (Codex): /ready's Learn tick makes the two reads it needs and nothing else (use-learned.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { EventWithHost } from '@/app/types';

const reads = vi.hoisted(() => ({
  prep: vi.fn(),
  parts: vi.fn(),
  local: {} as Record<string, { contentVersion: number; completedAt: string }>,
  offers: true,
}));
vi.mock('@/app/data/event-prep-service', () => ({
  getMyPreparation: (...args: unknown[]) => reads.prep(...args),
  getMyPrepParts: (...args: unknown[]) => reads.parts(...args),
}));
vi.mock('@/app/prototypes/events/prep/prep-local-parts', async (importActual) => ({
  ...(await importActual<typeof import('@/app/prototypes/events/prep/prep-local-parts')>()),
  readLocalParts: () => reads.local,
}));
vi.mock('@/app/prototypes/events/series-recipes', async (importActual) => ({
  ...(await importActual<typeof import('@/app/prototypes/events/series-recipes')>()),
  offersPreparation: () => reads.offers,
}));

import { useLearned } from '@/app/prototypes/events/prep/use-learned';
import { PART_VERSIONS } from '@/app/prototypes/events/prep/prep-plan';

const event = { id: 'ev-1' } as EventWithHost;
const at = '2026-11-20T10:00:00.000Z';
const row = (part: 'cognitive_video' | 'cmp7', version = PART_VERSIONS[part]) =>
  ({ part, contentVersion: version, completedAt: at, skippedAt: null });

beforeEach(() => {
  reads.prep.mockReset().mockResolvedValue(null);
  reads.parts.mockReset().mockResolvedValue([]);
  reads.local = {};
  reads.offers = true;
});
afterEach(() => vi.restoreAllMocks());

describe('useLearned', () => {
  it('reads the preparation and the parts, once each, and nothing else', async () => {
    const { result } = renderHook(() => useLearned(event, 'profile-1'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(reads.prep).toHaveBeenCalledTimes(1);
    expect(reads.prep).toHaveBeenCalledWith('ev-1', 'profile-1');
    expect(reads.parts).toHaveBeenCalledTimes(1);
    expect(reads.parts).toHaveBeenCalledWith('profile-1');
    expect(result.current).toEqual({ loading: false, error: false, learned: false });
  });

  it.each([
    ['a completed preparation', { completedAt: at }, [], {}, true],
    ['both parts on the account', null, [row('cognitive_video'), row('cmp7')], {}, true],
    ['one part on the account, the other done signed-out', null, [row('cognitive_video')], { cmp7: { contentVersion: PART_VERSIONS.cmp7, completedAt: at } }, true],
    ['a stale account row and a current local one', null, [row('cognitive_video'), row('cmp7', PART_VERSIONS.cmp7 - 1)], { cmp7: { contentVersion: PART_VERSIONS.cmp7, completedAt: at } }, true],
    ['one part only', null, [row('cognitive_video')], {}, false],
  ] as const)('%s: learned %s', async (_name, prep, parts, local, learned) => {
    reads.prep.mockResolvedValue(prep);
    reads.parts.mockResolvedValue(parts);
    reads.local = local;
    const { result } = renderHook(() => useLearned(event, 'profile-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.learned).toBe(learned);
  });

  it('a failed read is an error, with no tick', async () => {
    reads.parts.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useLearned(event, 'profile-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, error: true, learned: false });
  });

  it('a failed read (offline) still ticks learning done on this device', async () => {
    reads.prep.mockRejectedValue(new TypeError('Failed to fetch'));
    reads.local = {
      cognitive_video: { contentVersion: PART_VERSIONS.cognitive_video, completedAt: at },
      cmp7: { contentVersion: PART_VERSIONS.cmp7, completedAt: at },
    };
    const { result } = renderHook(() => useLearned(event, 'profile-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, error: false, learned: true });
  });

  it('not asked with no preparation offered, no viewer, or no event: no read, not loading', () => {
    reads.offers = false;
    expect(renderHook(() => useLearned(event, 'profile-1')).result.current).toEqual({ loading: false, error: false, learned: false });
    reads.offers = true;
    expect(renderHook(() => useLearned(event, undefined)).result.current.loading).toBe(false);
    expect(renderHook(() => useLearned(null, 'profile-1')).result.current.loading).toBe(false);
    expect(reads.prep).not.toHaveBeenCalled();
    expect(reads.parts).not.toHaveBeenCalled();
  });

  it('a hidden tab makes no read until it is shown (metered-services rule 3)', async () => {
    let state: DocumentVisibilityState = 'hidden';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state);
    const { result } = renderHook(() => useLearned(event, 'profile-1'));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(reads.prep).not.toHaveBeenCalled();
    expect(reads.parts).not.toHaveBeenCalled();
    state = 'visible';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(reads.prep).toHaveBeenCalledTimes(1);
    expect(reads.parts).toHaveBeenCalledTimes(1);
  });
});
