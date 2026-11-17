/**
 * P1061: the point page's movement read. Two parts of the page share a read only while it is in flight; once it
 * has settled, the same point, viewer and counts read the database again (a viewer who moved A, B, then back to A
 * must not be shown the rows from their first visit). While a new read of the same point loads, the last rows stay.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { PointMovementRows } from '@/app/data/movement-service';

const getPointMovement = vi.fn();
vi.mock('@/app/data/movement-service', () => ({ getPointMovement: (id: string) => getPointMovement(id) }));

import { usePointMovement } from '@/app/components/movement/use-point-movement';

const rows = (tag: string): PointMovementRows => ({
  pointId: 'point-id-0001', stories: [], verifications: [], history: [], current: [], agentIds: [tag],
  people: new Map(), events: [], groups: [],
});

// A block body: a function returned from beforeEach would run as its cleanup.
beforeEach(() => { getPointMovement.mockReset(); });

describe('P1061 usePointMovement', () => {
  it('two parts mounted together share one read', async () => {
    getPointMovement.mockResolvedValue(rows('a'));
    const a = renderHook(() => usePointMovement('point-id-0001', 'user-id-0001', 'v1'));
    const b = renderHook(() => usePointMovement('point-id-0001', 'user-id-0001', 'v1'));
    await waitFor(() => expect(a.result.current.data?.agentIds).toEqual(['a']));
    await waitFor(() => expect(b.result.current.data?.agentIds).toEqual(['a']));
    expect(getPointMovement).toHaveBeenCalledTimes(1);
  });

  it('a settled read is never served again: the same key later reads the database', async () => {
    getPointMovement.mockResolvedValueOnce(rows('first'));
    const first = renderHook(() => usePointMovement('point-id-0002', 'user-id-0001', 'v1'));
    await waitFor(() => expect(first.result.current.data?.agentIds).toEqual(['first']));
    first.unmount();
    getPointMovement.mockResolvedValueOnce(rows('second'));
    const again = renderHook(() => usePointMovement('point-id-0002', 'user-id-0001', 'v1'));
    await waitFor(() => expect(again.result.current.data?.agentIds).toEqual(['second']));
    expect(getPointMovement).toHaveBeenCalledTimes(2);
  });

  it('a new read of the same point keeps the last rows on screen until it answers', async () => {
    getPointMovement.mockResolvedValueOnce(rows('before'));
    let release: (r: PointMovementRows) => void = () => {};
    const { result, rerender } = renderHook(({ v }) => usePointMovement('point-id-0003', 'user-id-0001', v), { initialProps: { v: 'v1' } });
    await waitFor(() => expect(result.current.data?.agentIds).toEqual(['before']));
    getPointMovement.mockReturnValueOnce(new Promise<PointMovementRows>(r => { release = r; }));
    rerender({ v: 'v2' });
    expect(result.current.data?.agentIds).toEqual(['before']);
    release(rows('after'));
    await waitFor(() => expect(result.current.data?.agentIds).toEqual(['after']));
  });

  it('rows read for one viewer are never held for another', async () => {
    getPointMovement.mockResolvedValueOnce(rows('viewer-one'));
    const { result, rerender } = renderHook(({ viewer }) => usePointMovement('point-id-0005', viewer, 'v1'), { initialProps: { viewer: 'user-id-0001' } });
    await waitFor(() => expect(result.current.data?.agentIds).toEqual(['viewer-one']));
    getPointMovement.mockReturnValueOnce(new Promise<PointMovementRows>(() => {}));
    rerender({ viewer: 'user-id-0002' });
    expect(result.current.data).toBeUndefined();
  });

  it('a failure is reported as one, with no rows', async () => {
    getPointMovement.mockRejectedValue(new Error('Could not load how positions changed'));
    const { result } = renderHook(() => usePointMovement('point-id-0004', undefined, 'v1'));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
