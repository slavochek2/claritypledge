/**
 * P1675 UAT round 2 (fixes 9, 10, 12): usePrepState's minutes on a Clarity Night.
 * The total is min(computed remaining, stated 15) for everyone: never above 15, only shrinking; total-only exactly when the
 * cap is in effect; while the read is loading: null.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const ctl = vi.hoisted(() => ({
  prep: null as unknown,
  parts: [] as unknown[],
  hold: null as null | Promise<unknown>,
}));

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-1234' }, session: { user: { id: 'user-id-1234' } }, sessionChecked: true, isLoading: false }) }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false, reconnectTick: 0 }) }));
vi.mock('@/app/data/event-prep-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-prep-service')>()),
  getMyPreparation: async () => { if (ctl.hold) await ctl.hold; return ctl.prep; },
  getMyPrepParts: () => Promise.resolve(ctl.parts),
  getPrepSocialProof: () => new Promise(() => {}),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getPublicPointsFeed: () => Promise.resolve([]) } }));
vi.mock('@/app/prototypes/events/when-visible', () => ({ whenVisible: (run: () => void) => { run(); return () => {}; } }));

import { usePrepState } from '@/app/prototypes/events/prep/use-prep-state';
import type { EventWithHost } from '@/app/types';

const night = { id: 'n1', slug: 'n1', title: 'Clarity Night', hostId: 'h', seriesSlug: 'clarity-night', flow: 'clarity-night', preparationEnabled: true, statementTag: null, datetime: new Date(Date.now() + 864e5).toISOString(), orgId: 'o' } as unknown as EventWithHost;
const done = (part: string) => ({ part, contentVersion: 1, completedAt: '2026-01-01T00:00:00Z', skippedAt: null });

beforeEach(() => { ctl.prep = null; ctl.parts = []; ctl.hold = null; });

async function minutesOf(): Promise<{ minutes: number | null; totalOnly: boolean }> {
  const { result } = renderHook(() => usePrepState(night, 'user-id-1234'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  return { minutes: result.current.minutes, totalOnly: result.current.totalOnly };
}

describe('P1675 R10 hook: the total is min(computed remaining, stated 15)', () => {
  it('a brand-new person (computed above 15): 15, as the total only', async () => {
    expect(await minutesOf()).toEqual({ minutes: 15, totalOnly: true });
  });

  it('pressing Start does not change it (started, no step done yet)', async () => {
    ctl.prep = { eventId: 'n1', startedAt: '2026-11-17T10:00:00Z', stepsDone: [], completedAt: null };
    expect(await minutesOf()).toEqual({ minutes: 15, totalOnly: true });
  });

  it('after one step with the remaining still above 15: still 15, total only (never jumps up)', async () => {
    ctl.prep = { eventId: 'n1', startedAt: '2026-11-17T10:00:00Z', stepsDone: ['welcome'], completedAt: null };
    const r = await minutesOf();
    expect(r.minutes).toBeLessThanOrEqual(15);
    if (r.minutes === 15) expect(r.totalOnly).toBe(true);
    else expect(r.totalOnly).toBe(false);
  });

  it('only shrinks: a later step with less remaining shows that number and the rows', async () => {
    ctl.prep = { eventId: 'n1', startedAt: '2026-11-17T10:00:00Z', stepsDone: ['welcome', 'intro_video', 'cognitive_video'], completedAt: null };
    const r = await minutesOf();
    expect(r.minutes).not.toBeNull();
    expect(r.minutes!).toBeLessThanOrEqual(15);
    expect(r.totalOnly).toBe(r.minutes === 15);
  });

  it('a person who did one part elsewhere (computed 17-19 by the plan): capped at 15', async () => {
    ctl.parts = [done('intro_video')];
    const r = await minutesOf();
    expect(r.minutes).toBeLessThanOrEqual(15);
    expect(r.minutes).not.toBeNull();
  });

  it('a hike-learned person (less to do): their computed number below 15, rows shown', async () => {
    ctl.parts = [done('intro_video'), done('cognitive_video'), done('principle_intro'), done('cmp7')];
    const r = await minutesOf();
    expect(r.minutes).not.toBeNull();
    expect(r.minutes!).toBeLessThan(15);
    expect(r.totalOnly).toBe(false);
  });
});

describe('P1675 R10 hook: no number before the read is in', () => {
  it('minutes is null while the preparation read is loading, then the number', async () => {
    let release!: () => void;
    ctl.hold = new Promise<void>((r) => { release = r; });
    const { result } = renderHook(() => usePrepState(night, 'user-id-1234'));
    expect(result.current.loading).toBe(true);
    expect(result.current.minutes).toBeNull();
    await act(async () => { release(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.minutes).toBe(15);
  });
});
