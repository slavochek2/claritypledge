/**
 * @file p1592-use-my-round-threads.test.tsx
 * @description P1592 D4: the "My rounds" list belongs to the conversation it was loaded for. Switching to another
 * conversation never shows the old list, not while the new one loads and not when the new load fails.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundThread } from '@/app/data/chat-round-threads';

const getMock = vi.fn<(conversationId: string) => Promise<RoundThread[]>>();
vi.mock('@/app/data/chat-round-threads', () => ({ getMyRoundThreads: (c: string) => getMock(c) }));
let handler: ((e: unknown) => void) | null = null;
const chatValue = { subscribe: (h: (e: unknown) => void) => { handler = h; return () => undefined; } };
vi.mock('@/app/pages/chat/chat-state', () => ({ useChat: () => chatValue }));

import { useMyRoundThreads } from '@/app/pages/chat/use-my-round-threads';

const roundA: RoundThread = { rootMessageId: 'root-a', roundNo: 1, title: 'Round 1 · Anna & Ben', createdAt: '2026-10-29T10:00:00Z' };
const roundB: RoundThread = { rootMessageId: 'root-b', roundNo: 1, title: 'Round 1 · Cleo & Dan', createdAt: '2026-10-30T10:00:00Z' };

beforeEach(() => vi.clearAllMocks());

describe('P1592 useMyRoundThreads never returns another conversation\'s rounds', () => {
  it('returns the list for the conversation it was loaded for', async () => {
    getMock.mockResolvedValue([roundA]);
    const { result } = renderHook(({ id }) => useMyRoundThreads(id, true), { initialProps: { id: 'conv-a' } });
    await waitFor(() => expect(result.current).toEqual([roundA]));
  });

  it('on a switch, the old list is gone at once and the new list replaces it when it loads', async () => {
    let release: (rows: RoundThread[]) => void = () => undefined;
    getMock.mockResolvedValueOnce([roundA]).mockImplementationOnce(() => new Promise<RoundThread[]>((r) => { release = r; }));
    const { result, rerender } = renderHook(({ id }) => useMyRoundThreads(id, true), { initialProps: { id: 'conv-a' } });
    await waitFor(() => expect(result.current).toEqual([roundA]));
    rerender({ id: 'conv-b' });
    expect(result.current).toEqual([]);
    await act(async () => release([roundB]));
    expect(result.current).toEqual([roundB]);
  });

  it('on a switch whose load FAILS, the old list stays gone (no stale rounds of the other event)', async () => {
    getMock.mockResolvedValueOnce([roundA]).mockRejectedValueOnce(new Error('network'));
    const { result, rerender } = renderHook(({ id }) => useMyRoundThreads(id, true), { initialProps: { id: 'conv-a' } });
    await waitFor(() => expect(result.current).toEqual([roundA]));
    rerender({ id: 'conv-b' });
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    expect(result.current).toEqual([]);
  });

  it('a slow answer for the previous conversation arriving after a switch is ignored', async () => {
    let releaseA: (rows: RoundThread[]) => void = () => undefined;
    getMock.mockImplementationOnce(() => new Promise<RoundThread[]>((r) => { releaseA = r; })).mockResolvedValueOnce([roundB]);
    const { result, rerender } = renderHook(({ id }) => useMyRoundThreads(id, true), { initialProps: { id: 'conv-a' } });
    rerender({ id: 'conv-b' });
    await waitFor(() => expect(result.current).toEqual([roundB]));
    await act(async () => releaseA([roundA]));
    expect(result.current).toEqual([roundB]);
  });

  it('within one conversation, an older load resolving after a newer one does not overwrite it', async () => {
    let releaseOld: (rows: RoundThread[]) => void = () => undefined;
    getMock.mockImplementationOnce(() => new Promise<RoundThread[]>((r) => { releaseOld = r; })).mockResolvedValueOnce([roundB]);
    const { result } = renderHook(() => useMyRoundThreads('conv-a', true));
    act(() => handler?.({ type: 'resync' })); // a second load, started after the first
    await waitFor(() => expect(result.current).toEqual([roundB]));
    await act(async () => releaseOld([roundA]));
    expect(result.current).toEqual([roundB]);
  });

  it('disabled (not an event channel) returns nothing and does not load', () => {
    const { result } = renderHook(() => useMyRoundThreads('conv-g', false));
    expect(result.current).toEqual([]);
    expect(getMock).not.toHaveBeenCalled();
  });
});
